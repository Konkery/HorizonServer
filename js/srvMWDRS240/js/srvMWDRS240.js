const ClassBaseService_S = require('./../../srvService/js/srvService');

const CONNECTION_TIMEOUT = 1000;

EVENT_SYSBUS_LIST = ['all-init-stage1-set', 'source-connect', 'all-disconnect'];
EVENT_MODBUS_LIST = ['modbusclientdrs-send'];
EVENT_EXPLOIT_LIST = ['modbusdrs-msg-get'];
const THIS_NAME = 'modbusDRS';

const SCALE_FACTORS = {
    0x0: 0,
    0x4: 0.001,
    0x5: 0.01,
    0x6: 0.1,
    0x7: 1,
    0x8: 10,
    0x9: 100
};

REG_OUT = {
    'Coil' : 0x01,
    'discInput': 0x02, 
    'holdReg': 0x03, 
    'inputReg': 0x04
};
REG_IN = {
    'Coil' : 0x05,
    'holdReg': 0x06,
    'Coils' : 0x0F,
    'holdRegs': 0x10
};

/**
 * @class
 * @description Класс предназначен для работы с регистрами ИП DRS240
 */
class MW_DRS240 extends ClassBaseService_S {
    static SCALE_FACTORS = SCALE_FACTORS;
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
        this.EmitEvents_logger_log({level: 'I', msg: 'ModbusDRS initialized.'});
    }

    /**
     * @method
     * @description Генерирует событие proxymodbusdrs-msg-get
     * @param {Object} _msg         - сообщение для отправки по шине modbusdrsBus
     */
    EmitEvents_proxymodbusdrs_msg_get({arg, value}) {
        const msg = {
            dest: 'proxymodbusdrs',
            com: 'proxymodbusdrs-msg-get',
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
    EmitEvents_modbusdrs_source_toss({arg, value}) {
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
     * @description Обрабатывает событие modbusdrs-msg-get
     * @param {String} _topic       - имя топика
     * @param {Object} _msg         - полученное сообщение по шине #_ExpBus
     */
    HandlerEvents_modbusdrs_msg_get( _topic, _msg ){
        const srcName = _msg.arg[0];
        const srcComm = _msg.arg[1];
        const val = _msg.value[0];

        switch (srcComm.reg) {
            case 0xC0:// регистр с множителями данных
                this.#_Sources[srcName].Scales = {
                    I_OUT: MW_DRS240.SCALE_FACTORS[(val.data[0] & 0xF000) >> 12],
                    V_OUT: MW_DRS240.SCALE_FACTORS[(val.data[0] & 0x0F00) >> 8],
                    FAN_SPEED: MW_DRS240.SCALE_FACTORS[(val.data[0] & 0x00F0) >> 4],
                    V_IN: MW_DRS240.SCALE_FACTORS[val.data[0] & 0x000F],
                    CURVE_TOUT: MW_DRS240.SCALE_FACTORS[(val.data[1] & 0xF000) >> 12],
                    TEMP_1: MW_DRS240.SCALE_FACTORS[(val.data[1] & 0x0F00) >> 8],
                    I_IN: MW_DRS240.SCALE_FACTORS[(val.data[1] & 0x00F0) >> 4]
                }
                break;
            case 0x50:// Входное напряжение
                this.EmitEvents_proxymodbusdrs_msg_get({arg: [srcName, 4], value: [val.data[0] * this.#_Sources[srcName].Scales.V_IN]});
                break;
            case 0x60:// Выходные напряжение и сила тока
                const u = val.data[0] * this.#_Sources[srcName].Scales.V_OUT;
                const i = val.data[1] * this.#_Sources[srcName].Scales.I_OUT;
                const p = u * i;
                const short = (i < 0.2 && u < 10.0) ? 1 : 0;
                this.EmitEvents_proxymodbusdrs_msg_get({arg: [srcName, 0], value: [u]});
                this.EmitEvents_proxymodbusdrs_msg_get({arg: [srcName, 1], value: [i]});
                this.EmitEvents_proxymodbusdrs_msg_get({arg: [srcName, 64], value: [p]});
                this.EmitEvents_proxymodbusdrs_msg_get({arg: [srcName, 65], value: [short]});
                /*if ((val.data[1] * this.#_Sources[srcName].Scales.I_OUT) > 0.5 || (val.data[0] * this.#_Sources[srcName].Scales.V_OUT) < 5.0) {
                    this.EmitEvents_logger_log({level: 'D', msg: `[${Date.now()}] [${srcName}] I: ${(val.data[1] * this.#_Sources[srcName].Scales.I_OUT).toFixed(2)} A, U: ${(val.data[0] * this.#_Sources[srcName].Scales.V_OUT).toFixed(2)} V`});
                }*/             
                break;
            case 0x62:// Температура
                this.EmitEvents_proxymodbusdrs_msg_get({arg: [srcName, 3], value: [val.data[0] * this.#_Sources[srcName].Scales.TEMP_1]});
                break;
            case 0x40:// флаги состояния
                const status = {
                    FAN_FAIL: val.data[0] & 1,
                    INNER_TEMP: (val.data[0] & 2) >> 1,
                    OUTPUT_VOLT: (val.data[0] & 4) >> 2,
                    OUTPUT_CURR: (val.data[0] & 8) >> 3,
                    SHORT_CIRCUIT: (val.data[0] & 16) >> 4,
                    AC_FAIL: (val.data[0] & 32) >> 5,
                    DC_ON: (val.data[0] & 64) >> 6,
                    AMB_TEMP: (val.data[0] & 128) >> 7,
                }
                this.EmitEvents_proxymodbusdrs_msg_get({arg: [srcName, 2], value: [JSON.stringify(status)]});
                break;
            default:
                break;
        }
    }

    HandlerEvents_modbusclientdrs_send( _topic, _msg ){
        try {
            const source_name = _msg.arg[0];
            const chNum = _msg.arg[1];
            const [value] = _msg.value;
            const [val] = value.value;

            let comm_id = 0x06;

            if (chNum < 32)
                throw 'Cannot set values for DRS channel with num < 32';

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
     * @description Посылает команду на чтение регистров скалирования
     */
    UpdateScalingStatus() {
        Object.entries(this.#_Sources).forEach(source => {
            source.Scales = {
                I_OUT: 0.01,
                V_OUT: 0.01,
                FAN_SPEED: 0.01,
                V_IN: 0.01,
                CURVE_TOUT: 0.01,
                TEMP_1: 0.01,
                I_IN: 0.01
            }
            let comm = {
                id: 0x03,
                reg: 0xC0,
                dat: 0,
                len: 2,
                mbID: 131
            };
            this.EmitEvents_enqueue_command({ arg: [source[0]], value: [comm]});
        })
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
        this.EmitEvents_logger_log({level: 'I', msg: 'DRS240: Connection starting. . .'});
        this.Connect();
    }    

    /**
     * @method
     * @description Инициализирует соединение с источниками
     */
    Connect() {
        let sourcesCount = 0;
        let tOut = setTimeout(() => {
            this.EmitEvents_logger_log({level: 'I', msg: `Connections done by DRS!`, obj: this.#_Sources});
            this.UpdateScalingStatus();
            this.Start();
        }, CONNECTION_TIMEOUT);
        Object.values(this.SourcesState)
            .filter(source => source.Protocol === this.#_Protocol && !source.IsConnected && source.CheckProcess && source.Status === 'active')
            .forEach((source) => {
                this.#_Sources[source.Name] = source;
                this.EmitEvents_modbusdrs_source_toss({ arg: [{dest: THIS_NAME, com: 'modbusdrs-msg-get'}], value: [source]});
                sourcesCount++;
        });
        if (sourcesCount == 0) {
            clearTimeout(tOut);
            this.EmitEvents_logger_log({level: 'I', msg: `No unconnected sources found!`, obj: this.SourcesState});
        }
    }
}

module.exports = MW_DRS240;

