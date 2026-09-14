import ClassProxyActuatorDriver_S = require('../../srvProxyActuatorDriver/js/srvProxyActuatorDriver');
import { IHBridgeConfig } from '../../srvHBridgeMotor/js/srvHBridgeMotor';

declare class ClassProxyModBusHBridgeMotor_S extends ClassProxyActuatorDriver_S {
    _SourcesOpts: Map<string, IHBridgeConfig>;

    constructor(params: { _busList: any; _primaryBus: string; _node?: any });

    GetSourceByChName(chName: string): string | undefined;

    HandlerEvents_proxymhbridge_send(topic: string, msg: any): void;
    HandlerEvents_proxymhbridge_res(topic: string, msg: any): void;
    HandlerEvents_proxymhbridge_cmd(topic: string, msg: any): void;
    HandlerEvents_all_data_fine_set(topic: string, msg: any): void;

    EmitEvents_mhbridge_ch_set(sourceName: string, chNum: number, value: any): void;
}

export = ClassProxyModBusHBridgeMotor_S;
