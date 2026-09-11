const ClassBaseService_S = require('./../../srvService/js/srvService');

const CONNECTION_TIMEOUT = 1000;

const EVENT_SYSBUS_LIST = ['all-init-stage1-set', 'source-connect', 'all-disconnect'];
const EVENT_MODBUS_LIST = ['modbusclientkcs-send'];
const EVENT_EXPLOIT_LIST = ['modbuskcs-msg-get'];

class KinCony extends ClassBaseService_S {
    #_Sources;
    #_Host;
    #_ExpBus;
    #_Protocol;
    #_PrimaryBus;
    #_Name;
    #_dest;
    #_com;
    /**
     * @constructor
     * @description
     * Конструктор класса логгера
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ _busList, _primaryBus, _node, _protocol, _host, _expBus, _Name }) {
        super({ _name: _Name, _busNameList: ['sysBus', _primaryBus, 'logBus', _expBus], _busList, _node });
        this.#_Sources = {};
        this.#_Protocol = _protocol;
        this.#_PrimaryBus = _primaryBus;
        this.#_ExpBus = _expBus;
        this.#_Host = _host;
        this.#_Name = _Name;
        this.#_dest = `proxymodbuskcs${this.#_Name.includes('2') ? '2' : ''}`;
        this.#_com = `proxymodbuskcs${this.#_Name.includes('2') ? '2' : ''}-msg-get`;

        this[`HandlerEvents_modbusclientkcs${this.#_Name.includes('2') ? '2' : ''}_send`] = this.HandlerEvents_modbusclientkcs_send.bind(this);

        this.FillEventOnList('sysBus', EVENT_SYSBUS_LIST);
        this.FillEventOnList(this.#_PrimaryBus, [`modbusclientkcs${this.#_Name.includes('2') ? '2' : ''}-send`]);
        this.FillEventOnList(this.#_ExpBus, EVENT_EXPLOIT_LIST);
        this.EmitEvents_logger_log({level: 'I', msg: 'modbusKCS initialized.'});
    }

    EmitEvents_proxymodbuskcs_msg_get({arg, value}) {
        const msg = {
            dest: this.#_dest,
            com: this.#_com,
            arg,
            value
        };
        this.EmitMsg(this.#_PrimaryBus, msg.com, msg);
    }

    /**
     * @method
     * @description Запускает событие proxymodbus-msg-get
     * @returns msg         - отправляемое сообщение
     */
    EmitEvents_modbuskcs_source_toss({arg, value}) {
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

    HandlerEvents_modbuskcs_msg_get( _topic, _msg ){
        const srcName = _msg.arg[0];
        const srcComm = _msg.arg[1];
        const val = _msg.value[0];

        try {
            switch (srcComm.id) {
            case 0x05:
                this.EmitEvents_proxymodbuskcs_msg_get({arg: [srcName, srcComm.reg + 0x10], value: [Number(val.data[0])]});
                break;
            case 0x06:
                this.EmitEvents_proxymodbuskcs_msg_get({arg: [srcName, srcComm.reg + 0x0f], value: [Number(val.data[0])]});
                break;
            case 0x02:
                val.data.forEach((v, i) => {
                    this.EmitEvents_proxymodbuskcs_msg_get({arg: [srcName, i], value: [Number(v)]});
                });
                break;
            case 0x03:
                if (srcComm.reg == 0x11) {
                    if (val.data[1] != undefined) {
                        val.data[0] |= (val.data[1] << 13);
                    }
                    for (let i = 0; i < 0x10; i++) {
                        const v = ((val.data[0] & (1 << i)) >> i);
                        this.EmitEvents_proxymodbuskcs_msg_get({arg: [srcName, i], value: [v]});
                    }
                }
                else {
                    val.data.forEach((v, i) => {
                        this.EmitEvents_proxymodbuskcs_msg_get({arg: [srcName, i + srcComm.reg - 1], value: [Number(v)]});
                    });
                }                
                break;
            default:
                break;
            }
        }
        catch (e) {
            console.log (e.message);
        }
        
    }

    HandlerEvents_modbusclientkcs_send( _topic, _msg ){
        try {
            const source_name = _msg.arg[0];
            const chNum = _msg.arg[1];
            const [value] = _msg.value;
            const [val] = value.value;

            let comm_id = 0x05;
            let delimiter = 0x10;

            if (this.#_Sources[source_name].Groups[0].type == 'holdReg') {
                comm_id = 0x06;
                delimiter = 0x0f;
            }

            let comm = {
                id: comm_id,
                reg: chNum - delimiter,
                len: 0,
                dat: val,
                mbID: this.#_Sources[source_name].Groups[0].mbID
            }

            if (chNum == 32) {
                comm.id = 0x10;
                comm.reg = 9;
                switch (val) {
                    case 'UP':
                        comm.dat = [0,1,1,0];
                        this.EmitEvents_logger_log({level: 'D', msg: `[${Date.now()}] [${source_name}] Lift going up!`});
                        break;
                    case 'DOWN':
                        comm.dat = [1,0,0,1];
                        this.EmitEvents_logger_log({level: 'D', msg: `[${Date.now()}] [${source_name}] Lift going down!`});
                        break;
                    case 'STOP':
                    default:
                        comm.dat = [0,0,0,0];
                        break;
                }
            }

            this.EmitEvents_enqueue_command({ arg: [source_name], value: [comm]});
            if (val > 0) {
                this.EmitEvents_logger_log({level: 'D', msg: `[${Date.now()}] [${source_name}] Channel ${chNum} set to 1`});
            }            
        }
        catch (e) {
            this.EmitEvents_logger_log({level: 'W', msg: `Failed to send command via modbus protocol: ${e.message}`, obj: {exception: e.toString()}});
        }        
    }

    Start( _name, _source ) {        
        if (_source.Groups != undefined && _source.Groups.length > 0) {                
            _source.Groups.forEach((group) => {
                if (group.beh == 'Sensor' && group.type == 'discInput') {
                    setInterval(() => {
                        let comm = {
                            id: 0x02,
                            reg: 0x00,
                            len: 16,
                            dat: 0,
                            mbID: group.mbID
                        }
                        if (_source.IsConnected) {
                            this.EmitEvents_enqueue_command({ arg: [_name], value: [comm]});
                        }
                    },group.interval);
                }
                else if (group.beh == 'Sensor' && group.type == 'holdReg') {
                    let offset = 0x11;
                    let quan = 1;
                    if (group.startReg != undefined && group.numRegs != undefined) {
                        offset = group.startReg + 1;
                        quan = group.numRegs;
                    }
                    setInterval(() => {
                        let comm = {
                            id: 0x03,
                            reg: offset,
                            len: quan,
                            dat: 0,
                            mbID: group.mbID
                        }
                        if (_source.IsConnected) {
                            this.EmitEvents_enqueue_command({ arg: [_name], value: [comm]});
                        }
                    },group.interval);
                }
                else if (group.beh == 'Sensor2' && group.type == 'holdReg') {
                    let offset = 0x11;
                    let quan = 2;
                    if (group.startReg != undefined && group.numRegs != undefined) {
                        offset = group.startReg + 1;
                        quan = group.numRegs;
                    }
                    setInterval(() => {
                        let comm = {
                            id: 0x03,
                            reg: offset,
                            len: quan,
                            dat: 0,
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
     * @description Обработчик события, запускает подключение к источникам
     * @param {String} _topic       - топик сообщения 
     * @param {Object} _msg         - само сообщение
     */
    HandlerEvents_source_connect(_topic, _msg) {
        this.EmitEvents_logger_log({level: 'I', msg: 'Connection starting. . .'});
        this.Connect();
    }    

    /**
     * @method
     * @description Инициализирует соединение с источниками
     */
    Connect() {
        let sourcesCount = 0;
        let tOut = setTimeout(() => {
            Object.entries(this.#_Sources).forEach(([name, source]) => {
                if (source.IsConnected) {
                    this.EmitEvents_logger_log({level: 'I', msg: `${name} connected`});
                    this.Start(name, source);
                }
                else {
                    console.log(`${name} unconnected`);
                }
            });
            console.log(`Connections done by KinCony!`);
            this.EmitEvents_logger_log({level: 'I', msg: `Connections done!`});            
        }, CONNECTION_TIMEOUT);
        Object.values(this.SourcesState)
            .filter(source => source.Protocol === this.#_Protocol && !source.IsConnected && source.CheckProcess && source.Status === 'active')
            .forEach((source) => {
                this.#_Sources[source.Name] = source;
                this.EmitEvents_modbuskcs_source_toss({ arg: [{dest: this.#_Name, com: 'modbuskcs-msg-get'}], value: [source]});
                sourcesCount++;
        });
        if (sourcesCount == 0) {
            clearTimeout(tOut);
            this.EmitEvents_logger_log({level: 'I', msg: `No unconnected sources found!`});
        }
    }
}

module.exports = KinCony;

