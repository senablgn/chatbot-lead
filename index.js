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
  "It creates a user, returns course information to the user, and adds to the user's interests.",
  {
    nationalId: z.string().describe("National id of user"),
    firstName: z.string().describe("First name of user"),
    lastName: z.string().describe("Last name of user"),
    email: z.string().describe("Email of user"),
    phoneNumber: z.string().describe("Phone number"),
    userId: z.number().describe("User ID to which the interest will be added"),
    language: z
      .string()
      .describe("Language to be searched and added as an interest (e.g., English, German)."),
  },
  async (input) => {
    try {
        const coursesArray = input.language.split(/,|ve|and/).map(course => course.trim());

      // Önce kullanıcı oluşturuluyor
      const response = await axios.post("http://localhost:3000/customer", {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phoneNumber: input.phoneNumber,
        course: [coursesArray]
      });

      const userId = response.data.userId || input.userId;

      // Ardından kurs ilgisi ekleniyor
      // if (input.language) {
      //   await axios.post(`http://localhost:3000/user/${userId}`, {
      //     course: input.language,
      //   });
      //   console.log(`User ${userId} için ilgi alanı eklendi: ${input.language}`);
      // }

      // Sonuç başarılıysa kullanıcıya mesaj dönülüyor
      return {
        type: "text",
        content: `Kaydınız başarıyla oluşturuldu! Hoş geldiniz ${input.firstName}!`,
        userId: userId,
      };
    } catch (error) {
      console.error("Hata:", error.message);

      if (error.response?.data?.error) {
        return {
          type: "text",
          content: `Server error: ${error.response.data.error}`,
        };
      }

      return {
        type: "text",
        content: "Kullanıcı oluşturulamadı..",
      };
    }
  }
);

server.tool(
  "search",
  "It reads the API data and learns information about the courses.",
  // {
  //   language: z
  //     .string()
  //     .describe(
  //       "Language to be searched and added as an interest (e.g., English, German)"
  //     ),
  // },

  async (
    {
      /*userId, language*/
    }
  ) => {
    // try {
    //   await axios.post(`http://localhost:3000/user/${userId}`, {
    //     course: language,
    //   });
    //   console.log(`Kullanıcı ${userId} için ilgi alanı eklendi: ${language}`);
    // } catch (error) {
    //   console.error("Kurs ekleme (ilgi alanı) hatası:", error.message);
    // }

    try {
      const response = await axios.get(
        "https://mocki.io/v1/18be592d-643a-456c-baf0-048e329c3b05"
      );
      const courses = response.data;
      //   const normalizedLanguage = language.toLowerCase();

      // const matchedCourses = courses.filter((course) =>
      //   course.language_training.toLowerCase().includes(normalizedLanguage)
      // );

      // if (matchedCourses.length === 0) {
      //   return {
      //     type: "text",

      //     content: ` şu anda ${language} dilinde  aktif bir kursumuz bulunamadı. Yeni kurslar eklendiğinde size haber vereceğiz!`,
      //   };
      // }

      let courseInfo = `Harika! Sizin için bulduğum kurslar şunlar:\n\n`;

      // matchedCourses.forEach((course, index) => {
      //   courseInfo += `${index + 1}. ${course.language_training} Kursu\n`;
      //   courseInfo += `   Şehir: ${course.branch_city}\n`;
      //   courseInfo += `   Telefon: ${course.contact_phone}\n`;
      //   courseInfo += `   Email: ${course.contact_email}\n\n`;
      // });

      return {
        type: "text",
        content: courses,
      };
    } catch (error) {
      console.error("Kurs arama hatası:", error.message);
      return {
        type: "text",
        content: `bir hata oluştu.`,
      };
    }
  }
);

//api eklenecek
console.log("br");
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
