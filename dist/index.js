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
class JolocomWebServiceClient {
    constructor(serviceHostport = 'localhost:9000', base = '/', enableTls = false) {
        this.wsReconnectTimeout = 1500;
        this.msgFinalizationTimeout = 1000;
        this.msgN = 0;
        this.messages = {};
        const tls = enableTls ? 's' : '';
        this.serviceHostport = serviceHostport;
        this.serviceHttpUrl = `http${tls}://${serviceHostport}${base}`;
        this.serviceWsUrl = `ws${tls}://${serviceHostport}${base}`;
    }
    sendRPC(rpcName, request, pathPrefix = '/rpc') {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                console.log('sending RPC call', { rpcName, request }, 'over', this.rpcWS ? 'WebSocket' : 'http(s)');
                const msgID = this.msgN++;
                const msg = {
                    id: msgID,
                    rpc: rpcName,
                    request
                };
                if (this.rpcWS) {
                    this.rpcWS.send(JSON.stringify(msg));
                    this.messages[msgID] = Object.assign(Object.assign({}, msg), { resolve });
                }
                else {
                    resolve(fetch(`${this.serviceHttpUrl}${pathPrefix}`, {
                        method: 'POST',
                        body: JSON.stringify(msg),
                        headers: {
                            'Content-Type': 'application/json;charset=utf-8'
                        },
                    }).then(resp => {
                        if (resp.status !== 200) {
                            return resp.json().then(({ message }) => {
                                throw new Error(message);
                            });
                        }
                        return resp.json();
                    }).then(resJson => resJson.response));
                }
            });
        });
    }
    disconnectWs() {
        this.rpcWS && this.rpcWS.close();
        delete this.rpcWS;
        delete this.rpcWsUrl;
    }
    connectWs(pathPrefix = '/rpc') {
        return __awaiter(this, void 0, void 0, function* () {
            this.disconnectWs();
            /* NOTE: unused code for 'sessions'
            const session = await fetch(
              `${this.serviceHttpUrl}${pathPrefix}`,
              { method: 'POST' }
            )
            const sessJson = await session.json()
            return this._doConnectWs(sessJson.urls.rpcWS)
            */
            const rpcWsUrl = `${this.serviceWsUrl}${pathPrefix}`;
            yield this._doConnectWs(rpcWsUrl);
            this.rpcWsUrl = rpcWsUrl;
        });
    }
    _finalizeMessage(msgId) {
        // @ts-ignore
        if (this.msgFinalizationTimeout === -1)
            return;
        setTimeout(() => delete this.messages[msgId], this.msgFinalizationTimeout);
    }
    _doConnectWs(rpcWsUrl) {
        return __awaiter(this, void 0, void 0, function* () {
            const ws = new WebSocket(rpcWsUrl);
            ws.onmessage = (evt) => {
                console.log('received websocket data', evt.data);
                let msg;
                try {
                    msg = JSON.parse(evt.data);
                    this.messages[msg.id].resolve(msg.response);
                    this._finalizeMessage(msg.id);
                }
                catch (err) {
                    console.error('error while processing websocket data', err);
                }
            };
            ws.onerror = (evt) => {
                console.error('websocket error', evt);
                if (ws.readyState !== WebSocket.OPEN)
                    this.disconnectWs();
            };
            ws.onclose = (evt) => {
                delete this.rpcWS;
                setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                    if (this.rpcWsUrl !== rpcWsUrl)
                        return;
                    try {
                        yield this._doConnectWs(rpcWsUrl);
                    }
                    catch (err) {
                        console.error('failed to reconnect to websocket at ', rpcWsUrl);
                    }
                }), this.wsReconnectTimeout);
            };
            return new Promise((resolve, reject) => {
                ws.onerror = (evt) => {
                    console.error('error establishing WS conn', evt);
                    this.disconnectWs();
                    reject();
                };
                ws.onopen = (evt) => {
                    //if (this.rpcWS !== ws) return ws.close()
                    console.log('websocket connection established with', rpcWsUrl);
                    ws.onerror = (evt) => {
                        console.error('websocket error', evt);
                        if (ws.readyState !== WebSocket.OPEN)
                            this.disconnectWs();
                    };
                    resolve();
                };
            }).then(() => {
                if (this.rpcWS)
                    this.rpcWS.close();
                this.rpcWS = ws;
            });
        });
    }
}
exports.JolocomWebServiceClient = JolocomWebServiceClient;
//# sourceMappingURL=index.js.map