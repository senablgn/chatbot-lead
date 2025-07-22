import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import axios from "axios";
import { z } from "zod";

const app = express();
const port = 3001;
app.use(express.json());

const server = new McpServer({
  name: "Task Management",
  version: "1.0.0",
  capabilities: {
    tools: {},
    resources: {},
  },
});

server.tool(
  "create-user",
  "create user and save userId to memory",
  {
    nationalId: z.string().describe("National id of user"),
    firstName: z.string().describe("first name of user"),
    lastName: z.string().describe("last name of user"),
    email: z.string().describe("email of user"),
    phoneNumber: z.string().describe("phone number"),
  },
  async (input, memory) => {
    try {
      const response = await axios.post("http://localhost:3000/customer", {
        nationalId: input.nationalId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phoneNumber: input.phoneNumber,
      });
      
      const userId = response.data.userId;
      
      return {
        type: "text",
        content: `Kaydınız başarıyla oluşturuldu! Hoş geldiniz ${input.firstName}!`, 
        userId: userId ,
        memory: {
          ...memory,
          currentUserId: userId  
        }
      };
    } catch (error) {
      console.error("Hata:", error.message);
      if (error.response && error.response.data && error.response.data.error) {
        return {
          type: "text",
          content: `Server error: ${error.response.data.error}`,
        };
      }
      return {
        type: "text",
        content: "Kullanıcı oluşturulamadı.."
      };
    }
  }
);

server.tool(
  "search_and_add_interest",
  "Kullanıcının belirttiği dildeki kursları arar, bulduğu bilgileri gösterir VE bu dili kullanıcının ilgi alanlarına otomatik olarak ekler.",
  {
    language: z.string().describe("Aranacak ve ilgi alanı olarak eklenecek dil (örn: İngilizce, Almanca)"),
    userId: z.number().optional().describe("İlgi alanının ekleneceği kullanıcı ID'si. Genellikle bir önceki adımdan otomatik olarak alınır."),
  },
  async ({ language, userId: argUserId }, memory) => {
    const userId = argUserId || memory?.currentUserId;

    if (!userId) {
      return {
        type: "text",
        content: "Kullanıcı kimliği bulunamadı. Lütfen önce kullanıcı oluşturun veya geçerli bir oturum başlatın."
      }
    }
    
    try {
      
      await axios.post(
        `http://localhost:3000/user/${userId}`,
        { course: language }
      );
      console.log(`Kullanıcı ${userId} için ilgi alanı eklendi: ${language}`);
    } catch (error) {
      console.error("Kurs ekleme (ilgi alanı) hatası:", error.message);
     
    }

    
    try {
      const response = await axios.get("https://mocki.io/v1/18be592d-643a-456c-baf0-048e329c3b05");
      const courses = response.data;
      const normalizedLanguage = language.toLowerCase();
      
      const matchedCourses = courses.filter(course => 
        course.language_training.toLowerCase().includes(normalizedLanguage)
      );
      
      if (matchedCourses.length === 0) {
        return {
          type: "text",
          
          content: `${language} dilini ilgi alanlarınıza ekledim ancak şu anda bu dilde aktif bir kursumuz bulunamadı. Yeni kurslar eklendiğinde size haber vereceğiz!`
        };
      }
      
      let courseInfo = `Harika! ${language} dilini ilgi alanlarınıza ekledim. Sizin için bulduğum kurslar şunlar:\n\n`;
      
      matchedCourses.forEach((course, index) => {
        courseInfo += `${index + 1}. ${course.language_training} Kursu\n`;
        courseInfo += `   Şehir: ${course.branch_city}\n`;
        courseInfo += `   Telefon: ${course.contact_phone}\n`;
        courseInfo += `   Email: ${course.contact_email}\n\n`;
      });
      
      return {
        type: "text",
        content: courseInfo
      };
      
    } catch (error) {
      console.error("Kurs arama hatası:", error.message);
      return {
        type: "text",
        content: `${language} dilini ilgi alanlarınıza ekledim ancak kurs bilgilerini alırken bir hata oluştu. Lütfen daha sonra tekrar deneyin.`
      };
    }
  }
);




//api eklenecek
console.log("br")
const transports = {};

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;

  res.on("close", () => {
    delete transports[transport.sessionId];
  });

  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  console.log(
    "POST /messages alındı:",
    req.query.sessionId,
    JSON.stringify(req.body, null, 2)
  );
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];

  if (transport instanceof SSEServerTransport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "session",
      },
      id: null,
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(` MCP Server is running on : http://0.0.0.0:${port}/sse`);
});
