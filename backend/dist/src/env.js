"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
// Prioridad a backend/.env sobre variables del sistema (p. ej. DATABASE_URL antigua en :5432).
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env'), override: true });
