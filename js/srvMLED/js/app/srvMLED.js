const ClassBaseService_S = require('./../../srvService/js/srvService');

const PRIMARY_BUS = 'modbusledBus';
const CONNECTION_TIMEOUT = 5000;

EVENT_SYSBUS_LIST = ['all-init-stage1-set', 'test-connect', 'all-disconnect'];
EVENT_MODBUS_LIST = ['modbusclientled-send'];
BUS_NAMES_LIST = ['sysBus', PRIMARY_BUS, 'logBus'];
const PROTOCOL = 'mled';
const THIS_NAME = 'modbusled';

REG_COLOR_LIST = {
    'white': [65535, 255],
    'black': [0, 0],
    'red': [255, 0],
    'green': [65280, 0],
    'yellow': [65535, 0],
    'blue': [0, 255],
    'purple': [255, 255],
    'lightblue': [49344, 255]
}

STATIC_COLOR_LIST = {
    'white': 2,
    'black': 3,
    'red': 11,
    'green': 12,
    'yellow': 13,
    'blue': 14,
    'purple': 15,
    'lightblue': 16,
    'custom': 37
};

RUNNING_COLOR_LIST = {
    'white': 27,
    'black': 20,
    'red': 21,
    'green': 22,
    'yellow': 23,
    'blue': 24,
    'purple': 25,
    'lightblue': 26,
    'custom': 47
};

class ModbusLED extends ClassBaseService_S {
    static LIGHT_STATUS = {
        OFF: 'OFF',
        ON: 'ON',
        WARN: 'WARN',
        ERROR: 'ERROR'
    };
    #_Sources;
    #_Host;
    #_ExpBus;
    /**
     * @constructor
     * @description
     * Конструктор класса логгера
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ _busList, _node, _host, _expBus }) {
        super({ _name: THIS_NAME, _busNameList: [...BUS_NAMES_LIST, _expBus], _busList, _node });
        this.#_Sources = {};
        this.#_Host = _host;
        this.#_ExpBus = _expBus;
        this.FillEventOnList('sysBus', EVENT_SYSBUS_LIST);
        this.FillEventOnList(PRIMARY_BUS, EVENT_MODBUS_LIST);
        this.EmitEvents_logger_log({level: 'I', msg: 'ModbusLED initialized.'});
    }

    /**
     * @method
     * @description Запускает событие proxymodbus-msg-get
     * @returns msg         - отправляемое сообщение
     */
    EmitEvents_modbusled_source_toss({arg, value}) {
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
     * @description Отправляет команду на испольнение в modbusclient
     * @param {*} param0 
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

    HandlerEvents_modbusclientled_send( _topic, _msg ){
        const source = _msg.arg[0];
        const grpID = _msg.arg[1];
        const [state] = _msg.value[0].value;

        if (state == null) {
            this.EmitEvents_logger_log({level: 'W', msg: 'Empty state command'});
        }

        if (state.target == null) {
            this.EmitEvents_logger_log({level: 'W', msg: 'No target to execute command'});
        }
 
        let comm = {
            mbID: this.#_Sources[source].Groups[grpID].mbID,
            len: 0
        };

        try {
            switch (state.target) {
            case 'setup':
                if (Object.keys(state).includes('register','value')) {
                    comm.reg = state.register;
                    comm.dat = state.value;
                }
                else {
                    this.EmitEvents_logger_log({level: 'W', msg: `Not enough info: ${state}. Missing 'register' or 'value'`});
                }

                if (comm.dat.length == null)
                    comm.id = 0x06;
                else
                    comm.id = 0x10;
                break;
            case 'stripe':
                comm.reg = 30;
                let c_index;
                if (typeof state.color === 'string' || state.color instanceof String) {
                    c_index = state.color.toLowerCase() || 'black';
                }
                else if (Object.keys(state.color).includes('red','blue','green')) {
                    let addComm = {
                        id: 0x10,
                        reg: 48,
                        dat: [(state.color.green << 8) | (state.color.red), state.color.blue],
                        len: 0,
                        mbID: this.#_Sources[source].Groups[grpID].mbID
                    }
                    this.EmitEvents_enqueue_command({ arg: [source], value: [addComm]});
                    c_index = 'custom';
                }
                else {
                    this.EmitEvents_logger_log({level: 'W', msg: `Unknown color: ${state.color}`});
                }

                state.behaviour = state.behaviour.toLowerCase() || 'static';

                if (state.behaviour == 'static') { comm.dat = STATIC_COLOR_LIST[c_index] };
                if (state.behaviour == 'running') { comm.dat = RUNNING_COLOR_LIST[c_index] };
                
                comm.id = 0x06;
                break;
            case 'diode':
                let reg1, reg2;
                comm.reg = 102 + state.dStart * 2;
                comm.len = 1;
                comm.dat = this.State_to_Val([state.Status], this.#_Sources[source].Groups[grpID].blink);

                this.#_Sources[source].Groups[grpID].Lights[state.dStart] = state.Status;

                if (typeof state.color === 'string' || state.color instanceof String) {
                    state.color = state.color.toLowerCase() || 'black';
                    reg1 = REG_COLOR_LIST[state.color][0];
                    reg2 = REG_COLOR_LIST[state.color][1];
                }
                else if (Object.keys(state.color).includes('red','blue','green')) {
                    reg1 = (state.color.green << 8) | (state.color.red);
                    reg2 = state.color.blue;                    
                }
                else {
                    this.EmitEvents_logger_log({level: 'W', msg: `Unknown color: ${state.color}`});
                }
                comm.dat = [];
                for (let i = 0; i < state.dQuan; i++) { comm.dat.push(reg1, reg2); }

                comm.id = 0x10;
                break;
            case 'on':
                comm.reg = 102 + state.Num * 2;
                comm.len = 1;

                this.#_Sources[source].Groups[grpID].Lights[state.Num + 1] = ModbusLED.LIGHT_STATUS.ON;
                comm.dat = [65535, 255];
                comm.id = 0x10;
                break;
            case 'off':
                comm.reg = 102 + state.Num * 2;
                comm.len = 1;

                this.#_Sources[source].Groups[grpID].Lights[state.Num + 1] = ModbusLED.LIGHT_STATUS.OFF;
                comm.dat = [0, 0];
                comm.id = 0x10;
                break;
            case 'warn':
                comm.reg = 102 + state.Num * 2;
                comm.len = 1;

                this.#_Sources[source].Groups[grpID].Lights[state.Num + 1] = ModbusLED.LIGHT_STATUS.WARN;
                comm.dat = [255 * this.#_Sources[source].Groups[grpID].blink, 0];
                comm.id = 0x10;
                break;
            case 'error':
                comm.reg = 102 + state.Num * 2;
                comm.len = 1;

                this.#_Sources[source].Groups[grpID].Lights[state.Num + 1] = ModbusLED.LIGHT_STATUS.ERROR;
                comm.dat = [255, 0];
                comm.id = 0x10;
                break;
            default:
                this.EmitEvents_logger_log({level: 'W', msg: `Unknown target: ${state.target}`});
                return;
            }
            if (comm.id != null) { this.EmitEvents_enqueue_command({ arg: [source], value: [comm]}); }
        }
        catch (e) {
            this.EmitEvents_logger_log({level: 'E', msg: `Unexpected error: ${e.message}`, obj:  e});
        }
    }


    /**
     * @method
     * @description Обработчик события, запускает подключение к источникам
     * @param {String} _topic       - топик сообщения 
     * @param {Object} _msg         - само сообщение
     */
    HandlerEvents_test_connect(_topic, _msg) {
        this.EmitEvents_logger_log({level: 'I', msg: 'Connection starting. . .'});
        this.Connect();
    }

    State_to_Val ( _stateArray, _blink ) {
        let regs = [];
        _stateArray.forEach(state => {
            switch (state) {
                case ModbusLED.LIGHT_STATUS.OFF:
                    regs.push(0, 0);
                    break;
                case ModbusLED.LIGHT_STATUS.ON:
                    regs.push(65535, 255);
                    break;
                case ModbusLED.LIGHT_STATUS.WARN:
                    regs.push(255 * _blink, 0);
                    break;
                case ModbusLED.LIGHT_STATUS.ERROR:
                default:
                    regs.push(255, 0);
                    break;
            }
        })
        return regs;
    }

    Start( _name, _source ) {
         if (_source.Groups != undefined && _source.Groups.length > 0) {                
            _source.Groups.forEach((group) => {
                let leng = {
                    id: 0x06,
                    reg: 0x03,
                    len: 1,
                    dat: group.strLen,
                    mbID: group.mbID
                }
                if (_source.IsConnected) {
                    this.EmitEvents_enqueue_command({ arg: [_name], value: [leng]});
                }
                if (group.beh == 'Update') {
                    group.Lights = Array(group.strLen).fill(ModbusLED.LIGHT_STATUS.OFF);
                    group.blink = 0;
                    setInterval(() => {
                        group.blink ^= 1;
                        let comm = {
                            id: 0x10,
                            reg: 0x64,
                            len: group.strLen * 2,
                            dat: this.State_to_Val(group.Lights, group.blink),
                            mbID: group.mbID
                        }
                        if (_source.IsConnected) {
                            this.EmitEvents_enqueue_command({ arg: [_name], value: [comm]});
                        }
                    },group.interval);
                }
            })
        }
    }
    

    /**
     * @method
     * @description Инициализирует соединение с источниками
     */
    Connect() {
        let sourcesCount = 0;
        let tOut = setTimeout(() => {
            this.EmitEvents_logger_log({level: 'I', msg: `Connections done!`, obj: this.SourcesState});
            Object.entries(this.#_Sources).forEach(([name, source]) => {
                if (source.IsConnected) {
                    this.EmitEvents_logger_log({level: 'I', msg: `${name} connected`, obj: source});
                    this.Start(name, source);
                }
                else {
                    console.log(`${name} unconnected`);
                }
            });
            console.log(`Connections done by MLED!`);
        }, CONNECTION_TIMEOUT);
        Object.values(this.SourcesState)
            .filter(source => source.Protocol === PROTOCOL && !source.IsConnected && source.CheckProcess && source.Status === 'active')
            .forEach((source) => {
                this.#_Sources[source.Name] = source;
                this.EmitEvents_modbusled_source_toss({ arg: [{dest: THIS_NAME, com: 'modbusled-msg-get'}], value: [source]});
                sourcesCount++;
        });
        if (sourcesCount == 0) {
            clearTimeout(tOut);
            this.EmitEvents_logger_log({level: 'I', msg: `No unconnected sources found!`, obj: this.SourcesState});
        }
    }
}

module.exports = ModbusLED;