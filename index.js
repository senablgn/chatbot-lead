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
  async (input) => {
    try {
      const response = await axios.post("http://localhost:3000/customer", {
        nationalId: input.nationalId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phoneNumber: input.phoneNumber,
      });
      
      const userId = response.data.userId;
      
      // userId'yi döndür ki agent memory'e kaydedebilsin
      return {
        type: "text",
        content: `Kaydınız başarıyla oluşturuldu! Hoş geldiniz ${input.firstName}!`,
        userId: userId ,// Bu kısmı ekliyoruz
        memory: {
          currentUserId: userId  // <-- BURASI KRİTİK
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
  "add_course_to_user",
  "Belirtilen kullanıcıya ilgi alanı olarak bir kurs ekler.",
  {
    userId: z.number().describe("Kursun ekleneceği kullanıcı ID'si (sayı)"),
    course: z.string().describe("Eklenmek istenen kurs adı"),
  },
  async ({ userId, course }) => {
    console.log("TOOL INPUT:", { userId, course });
    
    try {
      const response = await axios.post(
        `http://localhost:3000/user/${userId}`, // Artık direkt kullanabilirsin
        {
          course: course,
        }
      );

      return {
        type: "text",
        text: `Kurs başarıyla eklendi: ${course}`,
      };
    } catch (error) {
      console.error("Kurs ekleme hatası:", error.message);
      return {
        type: "text",
        content: `Kurs eklenemedi: ${
          error.response?.data?.error?.message || error.message
        }`,
      };
    }
  }
);

server.tool(
  "search_courses",
  "Belirtilen dil veya kurs adına göre mevcut kursları arar ve bilgilerini getirir",
  {
    language: z.string().describe("Aranacak dil veya kurs adı (örn: İngilizce, Almanca, Fransızca)"),
  },
  async ({ language }) => {
    try {
      const response = await axios.get("https://mocki.io/v1/18be592d-643a-456c-baf0-048e329c3b05");
      const courses = response.data;
      
      // Dil adını normalize et (büyük-küçük harf duyarsız)
      const normalizedLanguage = language.toLowerCase();
      
      // İlgili kursları filtrele
      const matchedCourses = courses.filter(course => 
        course.language_training.toLowerCase().includes(normalizedLanguage)
      );
      
      if (matchedCourses.length === 0) {
        return {
          type: "text",
          content: `${language} için kurs bulunamadı. Mevcut diller için lütfen farklı bir dil deneyin.`
        };
      }
      
      // Kurs bilgilerini formatla
      let courseInfo = `${language} kursları hakkında bilgiler:\n\n`;
      
      matchedCourses.forEach((course, index) => {
        courseInfo += `${index + 1}. ${course.language_training} Kursu\n`;
        courseInfo += `    Şehir: ${course.branch_city}\n`;
        courseInfo += `    Telefon: ${course.contact_phone}\n`;
        courseInfo += `    Email: ${course.contact_email}\n\n`;
      });
      
      courseInfo += `Bu kurslardan herhangi birine ilgi duyuyorsanız, ilgi alanınıza eklemek için bana söyleyebilirsiniz!`;
      
      return {
        type: "text",
        content: courseInfo
      };
      
    } catch (error) {
      console.error("Kurs arama hatası:", error.message);
      return {
        type: "text",
        content: "Kurs bilgileri şu anda alınamıyor. Lütfen daha sonra tekrar deneyin."
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
