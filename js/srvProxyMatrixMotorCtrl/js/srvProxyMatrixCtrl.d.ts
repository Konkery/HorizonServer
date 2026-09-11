import ClassProxyActuatorDriver_S = require('../../srvProxyActuatorDriver/js/srvProxyActuatorDriver');
import { TypeMatrixCtrlAdvOpts } from '../../srvMatrixMotorCtrl/js/srvMatrixCtrl';

declare class ClassProxyModBusMatrixMotor_S extends ClassProxyActuatorDriver_S {
    _SourcesOpts: Map<string, TypeMatrixCtrlAdvOpts>;

    constructor(params: { _busList: any; _primaryBus: string; _node?: any });

    GetSourceByChName(chName: string): string | undefined;

    HandlerEvents_proxymmtrxmotor_send(topic: string, msg: any): void;
    HandlerEvents_proxymmtrxmotor_res(topic: string, msg: any): void;
    HandlerEvents_proxymmtrxmotor_cmd(topic: string, msg: any): void;
    HandlerEvents_all_data_fine_set(topic: string, msg: any): void;

    EmitEvents_mmtrxmotor_ch_set(sourceName: string, axis: string, chNum: number, value: any): void;
}

export = ClassProxyModBusMatrixMotor_S;
