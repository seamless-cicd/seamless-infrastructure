"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const webhook_1 = require("@slack/webhook");
const { SLACK_WEBHOOK_URL } = process.env;
const handler = (event) => __awaiter(void 0, void 0, void 0, function* () {
    if (SLACK_WEBHOOK_URL) {
        const message = event.Records[0].Sns.Message;
        const webhook = new webhook_1.IncomingWebhook(SLACK_WEBHOOK_URL);
        try {
            yield webhook.send({ text: message });
        }
        catch (error) {
            console.error(`Error sending message to Slack: ${error}`);
        }
    }
});
exports.handler = handler;
