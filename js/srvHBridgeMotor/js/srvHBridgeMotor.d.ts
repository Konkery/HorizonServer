import ClassBaseService_S = require('../../srvService/js/srvService');

export interface IHBridgeConfig {
    channels: string[4];
    [key: string]: any;
}

declare class ClassModBusHBridge_S extends ClassBaseService_S {
    PrimaryBus: string;
    _SwState: Map<string, Array<number | undefined>>;

    constructor(opts: { _busList: any; _primaryBus?: string; _advOpts?: any });

    get BridgeState(): Map<string, Array<number | undefined>>;

    Sources(): Generator<any, void, unknown>;
    HandlerEvents_all_init_stage1_set(topic: string, msg: any): Promise<void>;
    HandlerEvents_mhbridge_cmd(topic: string, msg: any): Promise<void>;
    HandlerEvents_mhbridge_ch_set(topic: string, msg: any): void;

    EmitEvents_proxymhbridge_res(opts: { hash?: string; arg: string[]; value: any[] }): void;

    Forward(sourceName: string, opts: { step?: number }): Promise<void>;
    Reverse(sourceName: string, opts: { step?: number }): Promise<void>;
    Stop(sourceName: string, opts: { step?: number }): Promise<void>;
    Switch(sourceName: string, chNum: number, value: number): Promise<void>;
}

export = ClassModBusHBridge_S;