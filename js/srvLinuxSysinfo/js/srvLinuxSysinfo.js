const ClassBaseService_S = require('./../../srvService/js/srvService');

const CONNECTION_TIMEOUT = 1000;

EVENT_SYSBUS_LIST = ['all-init-stage1-set', 'source-connect'];
const THIS_NAME = 'linuxsysinfo';

/**
 * @class
 * @description Класс предназначен для работы ядром Linux
 */
class LinuxSysinfo extends ClassBaseService_S {
    #_Protocol;
    #_PrimaryBus;
    #_Sources;
    #_SI;
    /**
     * @constructor
     * @description Конструктор класса
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ _busList, _primaryBus, _node, _protocol}) {
        super({ _name: THIS_NAME, _busNameList: ['sysBus', _primaryBus, 'logBus'], _busList, _node });
        this.#_Protocol = _protocol;
        this.#_PrimaryBus = _primaryBus;
        this.#_Sources = {};
        this.#_SI = require("systeminformation");
        this.FillEventOnList('sysBus', EVENT_SYSBUS_LIST);
        this.EmitEvents_logger_log({level: 'I', msg: 'LinuxSysinfo initialized.'});
    }

    /**
     * @method
     * @description Генерирует событие proxymodbusdrs-msg-get
     * @param {Object} _msg         - сообщение для отправки по шине modbusdrsBus
     */
    EmitEvents_proxylinuxsysinfo_msg_get({arg, value}) {
        const msg = {
            dest: 'proxylinuxsysinfo',
            com: 'proxylinuxsysinfo-msg-get',
            arg,
            value
        };
        this.EmitMsg(this.#_PrimaryBus, msg.com, msg);
    }


    /**
     * @method
     * @description Начинает опрос групп регистров показаний напряжения и тока, а также состояний ИП
     */
    Start() {
        Object.values(this.SourcesState)
            .filter(source => source.Protocol === this.#_Protocol && !source.IsConnected && source.CheckProcess && source.Status === 'active')
            .forEach((source) => {
                this.#_Sources[source.Name] = source;
        });
        Object.entries(this.#_Sources).forEach(([name, source]) => {
            if (source.Groups != undefined && source.Groups.length > 0) {                
                source.Groups.forEach((group) => {
                    if (group.beh == 'Sensor') {
                        setInterval(() => {
                            this.#_SI.cpuTemperature()
                                .then((data) => {
                                    this.EmitEvents_proxylinuxsysinfo_msg_get({arg: ['', 0], value: [data.main]});
                                })
                                .catch((error) => {
                                    this.EmitEvents_logger_log({level: 'E', msg: `LinuxSysinfo: ${error}`});
                            });
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
        this.EmitEvents_logger_log({level: 'I', msg: 'LinuxSysinfo: Initializing. . .'});
        this.Start();
    }    

}

module.exports = LinuxSysinfo;

