import fs, { mkdirSync, unlinkSync } from "fs";
import path from "path";

const BODY_KEYPOINTS_ORDER = [
  "Nose",
  "Neck",
  "RShoulder",
  "RElbow",
  "RWrist",
  "LShoulder",
  "LElbow",
  "LWrist",
  "MidHip",
  "RHip",
  "RKnee",
  "RAnkle",
  "LHip",
  "LKnee",
  "LAnkle",
  "REye",
  "LEye",
  "REar",
  "LEar",
  "LBigToe",
  "LSmallToe",
  "LHeel",
  "RBigToe",
  "RSmallToe",
  "RHeel",
];

const HAND_KEYPOINTS_ORDER = [
  "Wrist",
  "Thumb1",
  "Thumb2",
  "Thumb3",
  "Thumb4",
  "Index1",
  "Index2",
  "Index3",
  "Index4",
  "Middle1",
  "Middle2",
  "Middle3",
  "Middle4",
  "Ring1",
  "Ring2",
  "Ring3",
  "Ring4",
  "Pinky1",
  "Pinky2",
  "Pinky3",
  "Pinky4",
];

const FACE_KEYPOINTS_ORDER = Array.from({ length: 70 }, (_, i) => `Face_${i}`);

interface Keypoint {
  x: number;
  y: number;
  z: number;
}

interface FrameData {
  body: { [key: string]: Keypoint };
  left_hand: { [key: string]: Keypoint };
  right_hand: { [key: string]: Keypoint };
  face: { [key: string]: Keypoint };
}

interface PoseData {
  [frame: string]: FrameData;
}

const ensureDirectoryExistence = (filePath: string): void => {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
};

const processPoseFile = (filePath: string, jsonFilePath: string): void => {
  const fileBuffer = fs.readFileSync(filePath);
  let fileText = fileBuffer.toString("utf8");
  
  const cleanKeypoints = fileText
    .replace(/'/g, '"')
    .replace(/np\.float(?:32|64)\(([-\d.]+)\)/g, "$1") // Extrair o valor numérico
    .replace(/[[\]]/g, "") // Remover colchetes
    .replace(/,/g, "")
    .replace(/(body|left_hand|right_hand|face)/g, "")
    .replace(/"/g, "")
    .replace(/["{:]/g, "") // Remover textos desnecessários
    .trim(); // Remover espaços no início e fim

  const lines = cleanKeypoints.split("\n").filter(Boolean); // Remover linhas vazias

  const poseData: PoseData = {};

  lines.forEach((line, index) => {
    const frameKey = `frame_${index + 1}`;
    const keypoints = line.split(/\s+/).filter(Boolean); // Separar por espaço
    console.log(keypoints[0]);
    const frameData: FrameData = {
      body: {},
      left_hand: {},
      right_hand: {},
      face: {},
    };

    // Agrupar os pontos em trios (x, y, z)
    const groups: number[][] = [];
    for (let i = 0; i < keypoints.length; i += 3) {
      const x = parseFloat(keypoints[i]); // Garantir conversão para número
      const y = parseFloat(keypoints[i + 1]);
      const z = parseFloat(keypoints[i + 2]);
      groups.push([x, y, z]);
    }
    console.log(groups[0][0]);
    // Processar grupos para cada parte do corpo
    BODY_KEYPOINTS_ORDER.forEach((keypoint, i) => {
      const [x, y, z] = groups[i] || [0, 0, 0];
      frameData.body[keypoint] = { x, y, z };
    });

    const offsetHand = BODY_KEYPOINTS_ORDER.length;
    HAND_KEYPOINTS_ORDER.forEach((keypoint, i) => {
      const [x, y, z] = groups[offsetHand + i] || [0, 0, 0];
      frameData.left_hand[`L${keypoint}`] = { x, y, z };
    });

    const offsetRightHand = offsetHand + HAND_KEYPOINTS_ORDER.length;
    HAND_KEYPOINTS_ORDER.forEach((keypoint, i) => {
      const [x, y, z] = groups[offsetRightHand + i] || [0, 0, 0];
      frameData.right_hand[`R${keypoint}`] = { x, y, z };
    });

    const offsetFace = offsetRightHand + HAND_KEYPOINTS_ORDER.length;
    FACE_KEYPOINTS_ORDER.forEach((keypoint, i) => {
      const [x, y, z] = groups[offsetFace + i] || [0, 0, 0];
      frameData.face[keypoint] = { x, y, z };
    });

    poseData[frameKey] = frameData;
  });

  ensureDirectoryExistence(jsonFilePath);
  fs.writeFileSync(jsonFilePath, JSON.stringify(poseData, null, 2));
};

const CACHE_DIR = "./tmp"; // Diretório de cache

// Middleware para criar o diretório temporário, se não existir
mkdirSync(CACHE_DIR, { recursive: true });

// Servidor Bun para receber o upload e retornar o json
const server = Bun.serve({
  port: 4000,
  async fetch(req) {
    const url = new URL(req.url);

    // Configuração de CORS
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Para requisições de pré-voo (OPTIONS)
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Lógica para upload de arquivo
    if (url.pathname === "/upload" && req.method === "POST") {
      const formdata = await req.formData();
      const file = formdata.get("pose");

      if (!file) {
        return new Response("No file uploaded", {
          status: 400,
          headers: corsHeaders,
        });
      }

      const posePath = path.join(CACHE_DIR, `${Date.now()}.pose`);
      const jsonPath = path.join(CACHE_DIR, `${Date.now()}.json`);

      try {
        // Escreve o arquivo .pose no disco
        await Bun.write(posePath, file);

        // Processa o arquivo e salva os frames no arquivo .json
        processPoseFile(posePath, jsonPath);

        // Lê o arquivo .json e retorna como resposta
        const jsonFileBuffer = fs.readFileSync(jsonPath);

        return new Response(jsonFileBuffer, {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      } finally {
        // Remove os arquivos do cache após a resposta
        await Promise.all([unlinkSync(posePath), unlinkSync(jsonPath)]);
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
});
