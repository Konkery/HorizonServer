import ClassBaseService_S from '../../srvService/js/srvService';
import ClassBusMessage from '../../srvBusMsg/js/srvBusMsg';

export interface ConstructorParams {
    _name: string;
    _busList: any;
    _primaryBus: string;
    _node?: any;
    _clientName: string;
    _protocol: string;
    _busNamesList?: string[];
    _eventPrimBusList: string[];
}

declare class ClassProxyActuatorDriver_S extends ClassBaseService_S {
    PrimaryBus: string;
    ClientName: string;
    Protocol: string;

    constructor(params: ConstructorParams);

    get HostSrvName(): string | undefined;

    Channels(sourceName: string): Generator<any, void, unknown>;
    Sources(): Generator<any, void, unknown>;

    HandlerEvents_send(msg: ClassBusMessage): void;
    HandlerEvents_res(msg: ClassBusMessage): void;

    EmitEvents_client_cmd(sourceName: string, cmd: any): void;
    EmitEvents_all_data_raw_get(source_name: string, ch_name: string, value: any): void;
    EmitEvents_all_data_fine_get(ch_name: string): void;
    EmitEvents_all_actuator_set(chName: string, value: any): void;
}

export = ClassProxyActuatorDriver_S;
