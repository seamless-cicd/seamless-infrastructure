"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SLACK_WEBHOOK_URL = exports.EMAIL_ADDRESS = exports.SNS_SUBSCRIBER_URL = exports.GITHUB_CLIENT_SECRET = exports.GITHUB_CLIENT_ID = exports.AWS_REGION = exports.AWS_ACCOUNT_ID = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    AWS_ACCOUNT_ID: zod_1.z.string(),
    AWS_REGION: zod_1.z.string(),
    GITHUB_CLIENT_ID: zod_1.z.string(),
    GITHUB_CLIENT_SECRET: zod_1.z.string(),
    SNS_SUBSCRIBER_URL: zod_1.z.string().url().optional(),
    EMAIL_ADDRESS: zod_1.z.string().email().optional(),
    SLACK_WEBHOOK_URL: zod_1.z.string().optional(),
});
const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
    console.error('Invalid environment variables:', JSON.stringify(parsedEnv.error.format()));
    process.exit(1);
}
_a = parsedEnv.data, exports.AWS_ACCOUNT_ID = _a.AWS_ACCOUNT_ID, exports.AWS_REGION = _a.AWS_REGION, exports.GITHUB_CLIENT_ID = _a.GITHUB_CLIENT_ID, exports.GITHUB_CLIENT_SECRET = _a.GITHUB_CLIENT_SECRET, exports.SNS_SUBSCRIBER_URL = _a.SNS_SUBSCRIBER_URL, exports.EMAIL_ADDRESS = _a.EMAIL_ADDRESS, exports.SLACK_WEBHOOK_URL = _a.SLACK_WEBHOOK_URL;
