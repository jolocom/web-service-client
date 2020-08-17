export declare class JolocomWebServiceClient {
    wsReconnectTimeout: number;
    msgFinalizationTimeout: number;
    rpcWS?: WebSocket;
    rpcWsUrl?: string;
    serviceHostport: string;
    serviceHttpUrl: string;
    serviceWsUrl: string;
    msgN: number;
    messages: {
        [id: string]: any;
    };
    constructor(serviceHostport?: string, base?: string, enableTls?: boolean);
    sendRPC(rpcName: string, request?: any, pathPrefix?: string): Promise<any>;
    disconnectWs(): void;
    connectWs(pathPrefix?: string): Promise<void>;
    private _finalizeMessage;
    private _doConnectWs;
}
