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
  "create user",
  {
    nationalId: z.string().describe("National id of user"),
    firstName: z.string().describe("first name of user"),
    lastName: z.string().describe("last name of user"),
    email: z.string().describe("email of user"),
    phoneNumber:z.string().describe("phone number")
  },
  async (input) => {
    try {

      const response = await axios.post("http://localhost:3000/customer", {
        nationalId: input.nationalId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phoneNumber:input.phoneNumber
      });

      return{
        type:"text",
        content:`Successed: ${response.data.message}`
      } 
      

    } catch (error) {
      console.error(" hata:", error.message);

      if (error.response && error.response.data && error.response.data.error) {
        return `Server error: ${error.response.data.error}`;
      }
 
      return "user not created..";
    }
  }
);




server.tool(
  "get_training_info",
  "Şehir ve/veya dile göre eğitim veren şubeleri getirir.",
  {
    city: z.string().optional().describe("Aranan şehir adı (örneğin İstanbul)"),
    language: z.string().optional().describe("Eğitim dili (örneğin İngilizce)")
  },
  async ({ city, language }) => {
    try {
      console.log(" Tool çağrıldı:", { city, language });

      const response = await axios.get("https://mocki.io/v1/18be592d-643a-456c-baf0-048e329c3b05");

      const rawData = response.data;

      // Normalize edelim:
      const branches = rawData.map((item) => ({
        branch_city: item.branch_city || item.şube_şehir || "",
        language_training: item.language_training || "",
        contact_phone: item.iletişim_telefonu || item.contact_phone || "",
        contact_email: item.iletişim_e_postası || item.contact_email || ""
      }));

      // 1. Şehir + Dil varsa:
      if (city && language) {
        const exactMatch = branches.find(
          b =>
            b.branch_city.toLowerCase() === city.toLowerCase() &&
            b.language_training.toLowerCase() === language.toLowerCase()
        );

        if (exactMatch) {
          return {
            content: [
              {
                type: "text",
                text:`  ${city} şubesinde ${language} eğitimi verilmektedir.\n ${exactMatch.contact_phone}\n${exactMatch.contact_email}`
              }
            ]
          };
        }

        const otherCities = branches.filter(
          b => b.language_training.toLowerCase() === language.toLowerCase()
        );

        if (otherCities.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: ` Maalesef hiçbir şehirde ${language} eğitimi bulunamadı.`
              }
            ]
          };
        }

        const suggestions = otherCities.map(
          b => ` ${b.branch_city} -  ${b.contact_phone} |  ${b.contact_email}`
        ).join("\n");

        return {
          content: [
            {
              type: "text",
              text:`  ${city} şubesinde ${language} eğitimi bulunamadı.\n\n Ancak şu şehirlerde ${language} eğitimi verilmektedir:\n\n${suggestions}`
            }
          ]
        };
      }

      // 2. Sadece şehir varsa:
      if (city && !language) {
        const cityBranches = branches.filter(
          b => b.branch_city.toLowerCase() === city.toLowerCase()
        );

        if (cityBranches.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: ` ${city} şehrinde herhangi bir şube bulunamadı.`
              }
            ]
          };
        }

        const langs = cityBranches.map(
          b =>`  ${b.language_training} -  ${b.contact_phone} |  ${b.contact_email}`
        ).join("\n");

        return {
          content: [
            {
              type: "text",
              text:`  ${city} şehrindeki şubelerde verilen eğitimler:\n\n${langs}`
            }
          ]
        };
      }

      // 3. Sadece dil varsa:
      if (!city && language) {
        const langBranches = branches.filter(
          b => b.language_training.toLowerCase() === language.toLowerCase()
        );

        if (langBranches.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: ` Maalesef hiçbir şehirde ${language} eğitimi bulunamadı.`
              }
            ]
          };
        }

        const cities = langBranches.map(
          b => ` ${b.branch_city} -  ${b.contact_phone} | 📧 ${b.contact_email}`
        ).join("\n");

        return {
          content: [
            {
              type: "text",
              text: ` ${language} eğitimi verilen şehirler:\n\n${cities}`
            }
          ]
        };
      }

      // 4. Ne şehir ne dil verilmemiş:
      return {
        content: [
          {
            type: "text",
            text: "ℹ Lütfen şehir, dil ya da her ikisini belirterek tekrar deneyin."
          }
        ]
      };

    } catch (err) {
      console.error(" Eğitim API hatası:", err.message);
      return {
        content: [
          {
            type: "text",
            text: " Eğitim bilgileri alınamadı. API bağlantısında sorun olabilir."
          }
        ]
      };
    }
  }
);


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
  console.log("POST /messages alındı:", req.query.sessionId, JSON.stringify(req.body, null, 2));
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
