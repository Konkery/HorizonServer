import ClassBaseService_S = require('../../srvService/js/srvService');

export interface MatrixCtrlGroupConfig {
    [key: string]: any;
}

export interface TypeMatrixCtrlAdvOpts {
    sourceAxis: string | undefined;
    channels: {
        rows: string[];
        cols: string[];
    };
}

export interface MatrixCtrlConfig {
    ID: number;
    Status: string;
    Name: string;
    Type: string;
    Property: string;
    Protocol: string;
    DN: string;
    IP: string;
    Port: string;
    SensorChExpected: number;
    Groups: MatrixCtrlGroupConfig[];
    AdvOpts: TypeMatrixCtrlAdvOpts;
}

export interface TypeCoords {
    col: number;
    row: number;
}

export interface TypeMatrixCtrl {
    row: any;
    col: any;
}

declare class ClassModBusMatrixMotor_S extends ClassBaseService_S {
    PrimaryBus: string;
    _SwState: Map<string, { row: Array<number | undefined>; col: Array<number | undefined> }>;

    constructor(opts: { _busList: any; _primaryBus?: string; _advOpts?: any });

    Sources(): Generator<any, void, unknown>;
    HandlerEvents_all_init_stage1_set(topic: string, msg: any): Promise<void>;
    HandlerEvents_mmtrxmotor_cmd(topic: string, msg: any): Promise<void>;
    HandlerEvents_mmtrxmotor_ch_set(topic: string, msg: any): void;

    EmitEvents_proxymmtrxmotor_res(opts: { hash?: string; arg: string[]; value: any[] }): void;

    IndexToPos(sourceName: string, index: number): TypeCoords;
    On(sourceName: string, index: number, opts?: { step?: number }): Promise<boolean>;
    Off(sourceName: string, index: number, opts?: { step?: number }): Promise<boolean>;
    OffEmergency(): Promise<void>;
    Switch(sourceName: string, axis: string, chNum: number, value: number): Promise<void>;
}

export = ClassModBusMatrixMotor_S;
