import fs from "fs";
import path from "path";

interface PoseData {
  [part: string]: {
    [frame: string]: {
      [key: string]: {
        x: number;
        y: number;
        z: number;
      };
    };
  };
}

// Função para garantir que o diretório existe
const ensureDirectoryExistence = (filePath: string): void => {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
};

// Função para processar e salvar os frames incrementalmente em arquivo .json
const processPoseFile = (filePath: string, jsonFilePath: string): PoseData => {
  const fileBuffer = fs.readFileSync(filePath);
  const fileText = fileBuffer.toString("utf8");
  const lines = fileText.split("\n");
  console.log(lines.length);
  ensureDirectoryExistence(jsonFilePath);

  const poseData: PoseData = {};
  let currentPart = ""; // Parte do corpo atual
  let currentFrame = ""; // Frame atual

  lines.forEach((line) => {
    line = line.trim();

    if (line.startsWith("#")) {
      console.log("Linha com '#':", line); // Log da linha com '#'
      
      const partBodyMatch = RegExp(/# Frame: .*? - (.*)/).exec(line); // Regex para capturar a parte do corpo
  if (partBodyMatch) {
    currentPart = partBodyMatch[1].trim(); // Atualiza a parte do corpo atual
    if (!poseData[currentPart]) {
      poseData[currentPart] = {}; // Inicializa a entrada para essa parte no objeto PoseData
    }
  }
  
  // Verifica se a linha contém "distância_" para identificar o frame
  const frameMatch = line.match(/distância_\d{12}/);
  
  if (frameMatch) {
    currentFrame = frameMatch[0].trim(); // Atualiza o identificador do frame atual
    console.log("Frame atualizado:", currentFrame); // Log do frame atualizado
  } else {
    console.log("Nenhum frame encontrado na linha:", line); // Log quando não encontrar frame
  }
    } else if (line !== "" && currentPart && currentFrame) {
      //console.log("Linha atual:", line); // Log da linha atual


      // Processa as linhas de dados de coordenadas
      const [key, values] = line.split(":");
      if (values) {
        const [x, y, z] = values
          .trim()
          .split(" ")
          .map((value) => parseFloat(value));

        // Adiciona as coordenadas sob a parte do corpo atual e o frame
        if (!poseData[currentPart][currentFrame]) {
          poseData[currentPart][currentFrame] = {}; // Inicializa o frame, caso não exista
        }

        poseData[currentPart][currentFrame][key.trim()] = { x, y, z };
      }
    }
  });

  // Escreve os dados formatados no arquivo JSON
  fs.writeFileSync(jsonFilePath, JSON.stringify(poseData, null, 2));

  return poseData;
};

// Servidor Bun para receber o upload e retornar o arquivo .json
const server = Bun.serve({
  port: 4000,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/upload" && req.method === "POST") {
      const formdata = await req.formData();
      const file = formdata.get("pose");

      if (!file) {
        return new Response("No file uploaded", { status: 400 });
      }

      const hash = crypto.randomUUID();
      const filePath = `./uploads/${hash}.pose`;
      const jsonFilePath = `./uploads/${hash}.json`;

      // Escreve o arquivo .pose no disco
      await Bun.write(filePath, file);

      // Processa o arquivo e salva os frames no arquivo .json
      const formatedData = processPoseFile(filePath, jsonFilePath);

      // Lê o arquivo .json e retorna como resposta
      const jsonFileBuffer = fs.readFileSync(jsonFilePath);

      return new Response(jsonFileBuffer, {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});
