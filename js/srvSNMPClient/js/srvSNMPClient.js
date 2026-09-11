const ClassBaseService_S = require('./../../srvService/js/srvService');
const snmp = require ("net-snmp");

const CONNECTION_TIMEOUT = 1000;

EVENT_SYSBUS_LIST = ['all-init-stage1-set', 'source-connect', 'all-disconnect'];
EVENT_SNMP_LIST = ['snmpclient-send'];
const THIS_NAME = 'snmpclient';


class SNMPClient extends ClassBaseService_S {
    #_Sources;
    #_Protocol;
    #_PrimaryBus;
    /**
     * @constructor
     * @description
     * Конструктор класса логгера
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ _busList, _primaryBus, _node, _protocol }) {
        super({ _name: THIS_NAME, _busNameList: ['sysBus', _primaryBus, 'logBus'], _busList, _node });
        this.#_Sources = {};
        this.#_Protocol = _protocol;
        this.#_PrimaryBus = _primaryBus;
        this.FillEventOnList('sysBus', EVENT_SYSBUS_LIST);
        this.FillEventOnList(this.#_PrimaryBus, EVENT_SNMP_LIST);
        this.EmitEvents_logger_log({level: 'I', msg: 'SNMPClient initialized.'});
    }
    /**
     * @method
     * @description Запускает событие proxymodbus-msg-get
     * @returns msg         - отправляемое сообщение
     */
    EmitEvents_proxysnmp_msg_get({arg, value}) {
        const msg = {
            dest: 'proxysnmp',
            com: 'proxysnmp-msg-get',
            arg,
            value
        };
        this.EmitMsg(this.#_PrimaryBus, msg.com, msg);
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
     /**
     * @method
     * @description Обработчик события, запускает отправку сообщения по указанному сокету
     * @param {String} _topic       - топик сообщения 
     * @param {Object} _msg         - само сообщение
     */
    HandlerEvents_snmpclient_send(_topic, _msg) {
        try {
            /*const [source_name] = _msg.arg[0];
            const chNum = _msg.arg[1];
            const [value] = _msg.value;
            const [val] = value.value;

            if (this.#_Sources[source_name].groups == undefined &&
                    this.#_Sources[source_name].groups.length == 0)
                throw `No specified channel groups for ${source_name}`;

            let dest_group = this.#_Sources[source_name].groups.find(group => chNum >= group.startReg && chNum <= group.startReg + group.numRegs);
            if (dest_group === undefined)
                throw `Cannot find channel '${chNum}' in configuration of ${source_name}`;

            switch (dest_group.type) {
                case TYPE_COIL:
                    this.#_Sources[source_name].client.writeSingleCoil(chNum-1, val).then((resp) => {
                        this.EmitEvents_proxymodbus_msg_get({arg: [source_name, chNum], value: [val]});
                        this.EmitEvents_logger_log({level: 'I', msg: `Message sent to ${source_name}`});
                    }).catch(() => {
                        this.EmitEvents_logger_log({level: 'E', msg: `Failed to write to modbus source ${source_name}.`, obj: 
                            require('util').inspect(arguments, {
                                depth: null
                            })});
                    })
                    break;
                case TYPE_HOLD_REG:
                    this.#_Sources[source_name].client.writeSingleRegister(chNum-1, val).then((resp) => {
                        this.EmitEvents_proxymodbus_msg_get({arg: [source_name, chNum], value: [val]});
                        this.EmitEvents_logger_log({level: 'I', msg: `Message sent to ${source_name}`});
                    }).catch(() => {
                        this.EmitEvents_logger_log({level: 'E', msg: `Failed to write to modbus source ${source_name}.`, obj: 
                            require('util').inspect(arguments, {
                                depth: null
                            })});
                    })
                    break;
                case TYPE_DISC_INPUT:
                case TYPE_INPUT_REG:
                default:
                    this.EmitEvents_logger_log({level: 'E', msg: `Cannot send modbus message to ${source_name}. Unsupported type: ${dest_group.type}`, obj: dest_group});
                    break;
            }*/

        }
        catch (e) {
            this.EmitEvents_logger_log({level: 'W', msg: `Failed to send command via modbus protocol: ${e.message}`, obj: {exception: e.toString()}});
        }
    }
    /**
     * @method
     * @description Обработчик события, закрывает все существующие сокеты
     * @param {String} _topic       - топик сообщения 
     * @param {Object} _msg         - само сообщение
     */
    HandlerEvents_all_disconnect(_topic, _msg) {
        Object.values(this.#_Sources).forEach(source => {
             source.session.close();
        });
    }
    /**
     * @method
     * @description Начинает циклический опрос групп каналов по источникам
     */
    Start() {
        let interval = {};
        Object.entries(this.#_Sources).forEach(([name, source]) => {
            if (source.groups != undefined && source.groups.length > 0) {
                source.groups.forEach((group) => {
                    let oids = [];
                    for (let i = 0; i < group.numCh; i++) {
                        oids.push(`${source.baseOID}.${i+group.startCh+1}`);
                    }
                    interval.name = setInterval(() => {
                        source.session.get(oids, (e, varbinds) => {
                            if (e) {
                                this.EmitEvents_logger_log({level: 'E', msg: `${e}`, obj: this.SourcesState});
                                clearInterval(interval.name);
                                session.close();
                            } 
                            else {
                                for (let i = 0; i < varbinds.length; i++) {
                                    if (snmp.isVarbindError (varbinds[i])) {
                                        this.EmitEvents_logger_log({level: 'E', msg: `${snmp.varbindError(varbinds[i])}`, obj: this.SourcesState});
                                    } 
                                    else {
                                        this.EmitEvents_proxysnmp_msg_get({arg: [name, i + group.startCh], value: [varbinds[i].value]});
                                    }
                                }
                            }
                            
                        });
                    }, group.interval)
                });
            }
        })
    }
    /**
     * @method
     * @description Инициализирует соединение с источниками
     */
    Connect() {
        let sourcesCount = 0;
        let tOut = setTimeout(() => {
            this.EmitEvents_logger_log({level: 'I', msg: `Connections done!`, obj: this.SourcesState});
            this.Start();
        }, CONNECTION_TIMEOUT);
        Object.values(this.SourcesState)
            .filter(source => source.Protocol === this.#_Protocol && !source.IsConnected && source.CheckProcess && source.Status === 'active')
            .forEach((source) => {
                const name = (source.DN ? source.DN : source.IP);
                this.#_Sources[source.Name] = {session: snmp.createSession(name, "public"), baseOID: source.OID, groups: source.Groups};
                sourcesCount++;
                
                /*this.#_Sources[source.Name].session.trap(snmp.TrapType.LinkDown, (e) => {
                    if (e) {
                        this.EmitEvents_logger_log({level: 'E', msg: `${e}`, obj: this.SourcesState});
                    }
                });*/
        });
        if (sourcesCount == 0) {
            clearTimeout(tOut);
            this.EmitEvents_logger_log({level: 'I', msg: `No unconnected sources found!`, obj: this.SourcesState});
        }
    }
}

module.exports = SNMPClient;