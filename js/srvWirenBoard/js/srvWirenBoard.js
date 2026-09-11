const ClassBaseService_S = require('./../../srvService/js/srvService');

const CONNECTION_TIMEOUT = 1000;

const EVENT_SYSBUS_LIST = ['all-init-stage1-set', 'source-connect', 'all-disconnect'];
const EVENT_MODBUS_LIST = ['modbusclientwb-send'];
const EVENT_EXPLOIT_LIST = ['modbuswb-msg-get'];
const THIS_NAME = 'modbusWB';

const BATTERY_STATUS = [
    'Заряжается',
    'Полностью заряжена',
    'Разряжается',
    'Полностью разряжена',
    'Не заряжается'
];

const TEMP_STATUS = [ 
    'Норма',
    'Низкая, работа запрещена',
    'Низкая, только разряд',
    'Высокая, только разряд',
    'Высокая, работа запрещена'
];

const REG_OUT = {
    'Coil' : 0x01,
    'discInput': 0x02, 
    'holdReg': 0x03, 
    'inputReg': 0x04
};
const REG_IN = {
    'Coil' : 0x05,
    'holdReg': 0x06,
    'Coils' : 0x0F,
    'holdRegs': 0x10
};

/**
 * @class
 * @description Класс предназначен для работы с регистрами ИП DRS240
 */
class WirenBoard extends ClassBaseService_S {
    static BATTERY_STATES = BATTERY_STATUS;
    static TEMP_STATES = TEMP_STATUS;
    #_Sources;
    #_Host;
    #_ExpBus;
    #_Protocol;
    #_PrimaryBus;
    /**
     * @constructor
     * @description Конструктор класса
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ _busList, _primaryBus, _node, _protocol, _host, _expBus }) {
        super({ _name: THIS_NAME, _busNameList: ['sysBus', _primaryBus, 'logBus', _expBus], _busList, _node });
        this.#_Sources = {};
        this.#_Protocol = _protocol;
        this.#_PrimaryBus = _primaryBus;
        this.#_ExpBus = _expBus;
        this.#_Host = _host;
        this.FillEventOnList('sysBus', EVENT_SYSBUS_LIST);
        this.FillEventOnList(this.#_PrimaryBus, EVENT_MODBUS_LIST);
        this.FillEventOnList(this.#_ExpBus, EVENT_EXPLOIT_LIST);
        this.EmitEvents_logger_log({level: 'I', msg: 'ModbusWirenBoard initialized.'});
    }

    /**
     * @method
     * @description Генерирует событие proxymodbuswb-msg-get
     * @param {Object} _msg         - сообщение для отправки по шине modbuswbBus
     */
    EmitEvents_proxymodbuswb_msg_get({arg, value}) {
        const msg = {
            dest: 'proxymodbuswb',
            com: 'proxymodbuswb-msg-get',
            arg,
            value
        };
        this.EmitMsg(this.#_PrimaryBus, msg.com, msg);
    }

    /**
     * @method
     * @description Генерирует событие modbus-source-toss
     * @param {Object} _msg         - сообщение для отправки по шине #_ExpBus
     */
    EmitEvents_modbuswb_source_toss({arg, value}) {
        const msg = {
            dest: this.#_Host,
            com: 'modbus-source-toss',
            arg,
            value
        };
      
        this.EmitMsg(this.#_ExpBus, msg.com, msg);
    }

    /**
     * @method
     * @description Генерирует событие enqueue-command
     * @param {Object} _msg         - сообщение для отправки по шине #_ExpBus
     */
    EmitEvents_enqueue_command({arg, value}) {
        const msg = {
            dest: this.#_Host,
            com: 'enqueue-command',
            arg,
            value
        };
        
        this.EmitMsg(this.#_ExpBus, msg.com, msg);
    }

    /**
     * @method
     * @description Обрабатывает событие modbuswb-msg-get
     * @param {String} _topic       - имя топика
     * @param {Object} _msg         - полученное сообщение по шине #_ExpBus
     */
    HandlerEvents_modbuswb_msg_get( _topic, _msg ){
        const srcName = _msg.arg[0];
        const srcComm = _msg.arg[1];
        const val = _msg.value[0];

        switch (srcComm.reg) {
            case 0x00:// Выходные напряжение и сила тока
                this.EmitEvents_proxymodbuswb_msg_get({arg: [srcName, 0], value: [WirenBoard.BATTERY_STATES[val.data[0]]]});
                this.EmitEvents_proxymodbuswb_msg_get({arg: [srcName, 1], value: [WirenBoard.TEMP_STATES[val.data[1]]]});

                this.EmitEvents_proxymodbuswb_msg_get({arg: [srcName, 2], value: [val.data[2] / 1000]});
                this.EmitEvents_proxymodbuswb_msg_get({arg: [srcName, 3], value: [val.data[3] / 1000]});
                this.EmitEvents_proxymodbuswb_msg_get({arg: [srcName, 4], value: [val.data[4] / 1000]});

                this.EmitEvents_proxymodbuswb_msg_get({arg: [srcName, 5], value: [val.data[5] / 1000]});
                this.EmitEvents_proxymodbuswb_msg_get({arg: [srcName, 6], value: [val.data[6] / 1000]});
                this.EmitEvents_proxymodbuswb_msg_get({arg: [srcName, 7], value: [val.data[7] / 1000]});

                this.EmitEvents_proxymodbuswb_msg_get({arg: [srcName, 8], value: [val.data[8] / 100]});
                this.EmitEvents_proxymodbuswb_msg_get({arg: [srcName, 9], value: [val.data[9] / 100]});            
                break;
            default:
                break;
        }
    }

    HandlerEvents_modbusclientwb_send( _topic, _msg ){
        try {
            const source_name = _msg.arg[0];
            const chNum = _msg.arg[1];
            const [value] = _msg.value;
            const [val] = value.value;

            let comm_id = 0x06;

            if (chNum < 32)
                throw 'Cannot set values with num < 32';

            let comm = {
                id: comm_id,
                reg: chNum - 0x20,
                len: 0,
                dat: val,
                mbID: this.#_Sources[source_name].Groups[0].mbID
            }

            this.EmitEvents_enqueue_command({ arg: [source_name], value: [comm]});
        }
        catch (e) {
            this.EmitEvents_logger_log({level: 'W', msg: `Failed to send command via modbus protocol: ${e.message}`, obj: {exception: e.toString()}});
        }        
    }

    /**
     * @method
     * @description Начинает опрос групп регистров показаний напряжения и тока, а также состояний ИП
     */
    Start() {
        Object.entries(this.#_Sources).forEach(([name, source]) => {
            if (source.Groups != undefined && source.Groups.length > 0) {                
                source.Groups.forEach((group) => {
                    if (group.beh == 'Sensor') {
                        setInterval(() => {
                            let comm = {
                                id: REG_OUT[group.type],
                                reg: group.startReg,
                                len: group.numRegs,
                                dat: 0,
                                mbID: group.mbID
                            }
                            if (source.IsConnected) {
                                //this.EmitEvents_logger_log({level: 'D', msg: `[${Date.now()}]${name}: message send`});
                                this.EmitEvents_enqueue_command({ arg: [name], value: [comm]});
                            }
                        },group.interval);
                    }                    
                })
            }
        })
    }


    /**
     * @method
     * @description Обработчик события, запускает подключение к источникам
     * @param {String} _topic       - топик сообщения 
     * @param {Object} _msg         - само сообщение
     */
    HandlerEvents_source_connect(_topic, _msg) {
        this.EmitEvents_logger_log({level: 'I', msg: 'WirenBoard: Connection starting. . .'});
        this.Connect();
    }    

    /**
     * @method
     * @description Инициализирует соединение с источниками
     */
    Connect() {
        let sourcesCount = 0;
        let tOut = setTimeout(() => {
            this.EmitEvents_logger_log({level: 'I', msg: `Connections done by WirenBoard!`, obj: this.#_Sources});
            this.Start();
        }, CONNECTION_TIMEOUT);
        Object.values(this.SourcesState)
            .filter(source => source.Protocol === this.#_Protocol && !source.IsConnected && source.CheckProcess && source.Status === 'active')
            .forEach((source) => {
                this.#_Sources[source.Name] = source;
                this.EmitEvents_modbuswb_source_toss({ arg: [{dest: THIS_NAME, com: 'modbuswb-msg-get'}], value: [source]});
                sourcesCount++;
        });
        if (sourcesCount == 0) {
            clearTimeout(tOut);
            this.EmitEvents_logger_log({level: 'I', msg: `No unconnected sources found!`, obj: this.SourcesState});
        }
    }
}

module.exports = WirenBoard;

