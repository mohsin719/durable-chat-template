"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrap = bootstrap;
const platform_socket_io_1 = require("@nestjs/platform-socket.io");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const nestjs_pino_1 = require("nestjs-pino");
const express = __importStar(require("express"));
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        bufferLogs: true,
        bodyParser: false,
    });
    app.use(express.json({
        verify: (req, _res, buf) => { req.rawBody = buf; },
    }));
    app.use(express.urlencoded({ extended: true }));
    app.use((0, compression_1.default)());
    app.useLogger(app.get(nestjs_pino_1.Logger));
    app.useWebSocketAdapter(new platform_socket_io_1.IoAdapter(app));
    const config = app.get(config_1.ConfigService);
    app.use((0, helmet_1.default)());
    const webOrigin = config.get("WEB_ORIGIN") || "https://usnumhub.com,https://www.usnumhub.com";
    const allowedOrigins = webOrigin.split(",").map((o) => o.trim()).filter(o => o.length > 0);
    console.log('CORS Origins:', allowedOrigins);
    app.enableCors({
        origin: function (origin, callback) {
            if (!origin)
                return callback(null, true);
            const isAllowed = allowedOrigins.some((allowed) => {
                if (allowed === "*")
                    return true;
                if (allowed.includes("*")) {
                    const regex = new RegExp(`^${allowed.replace("*", "([^.]+)")}$`);
                    return regex.test(origin);
                }
                return allowed === origin;
            });
            if (isAllowed) {
                callback(null, true);
            }
            else {
                console.warn(`CORS blocked origin: ${origin}. Allowed: ${allowedOrigins.join(", ")}`);
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin", "X-CSRF-Token"],
        exposedHeaders: ["X-Total-Count", "X-Page-Number"],
        optionsSuccessStatus: 204,
        maxAge: 86400,
    });
    app.setGlobalPrefix("api");
    app.enableShutdownHooks();
    return app;
}
const port = process.env.PORT || 4000;
bootstrap()
    .then((app) => app.listen(port, "0.0.0.0"))
    .then(() => console.log(`Server running on port ${port}`))
    .catch((err) => { console.error("Bootstrap failed:", err); process.exit(1); });
//# sourceMappingURL=main.js.map