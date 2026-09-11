declare class ClassBaseService_S {
    constructor(opts: { _name: string; _busNameList: string[]; _busList: any; _node?: any });
    get Name(): string;
    get Status(): string;
    get BusList(): any;
    get SourcesState(): any;
    get ServicesState(): any;
    FillEventOnList(busName: string, topicNames: string[]): void;
    FillEventEmitList(serviceName: string, topicNames: string[]): void;
    EmitMsg(busName: string, topic: string, msg: any, opts?: { timeout?: number }): Promise<boolean>;
    EmitEvents_logger_log(opts: { level?: string; msg: string; obj?: any }): void;
    HandlerEvents_all_init_stage1_set(topic: string, msg: any): Promise<void>;
}
export = ClassBaseService_S;
