const ClassBaseService_S = require('../../srvService/js/srvService');

const COM_ALL_DATA_RAW_GET = 'all-data-raw-get';
const THIS_NAME = 'proxylinuxsysinfo';

const EVENT_SYSBUS_LIST = ['all-init-stage1-set', 'source-connect'];
const EVENT_SYSINFOBUS_LIST = ['proxylinuxsysinfo-msg-get'];

class ProxyLinuxSysinfo extends ClassBaseService_S {
    #_SourceMapNames;
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
        this.#_SourceMapNames = [];
        this.#_PrimaryBus = _primaryBus;
        this.#_Protocol = _protocol;
        this.FillEventOnList('sysBus', EVENT_SYSBUS_LIST);
        this.FillEventOnList(this.#_PrimaryBus, EVENT_SYSINFOBUS_LIST);
        this.EmitEvents_logger_log({level: 'I', msg: 'ProxyLinuxSYsinfo initialized.'});    
    }

    HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);

        Object.values(this.SourcesState)
            .filter(_source => _source.Protocol === this.#_Protocol)  
            .forEach(_source => {
                _source.CheckProxy = true;
                _source.PrimaryBus = this.#_PrimaryBus;
            });
    }

    HandlerEvents_source_connect(_topic, _msg) {
         Object.values(this.SourcesState)
            .filter(_source => _source.Protocol === this.#_Protocol)  
            .forEach(_source =>{
                Object.values(this.ServicesState)
                    .filter(_channel => _channel.AdvancedOptions && _channel.AdvancedOptions.SourceName === _source.Name)
                    .forEach(_channel => {
                        this.#_SourceMapNames.push({source: _source.Name, chNum: _channel.AdvancedOptions.ChNum, Name: _channel.Name});
                });
            });
    }

    /**
     * @method 
     * @description Вызывается при обработке события 'proxywsc_msg_get', который инициируется WSC
     * @param {string} _topic - команда
     * @param {ClassBusMsg_S} _msg - сообщение
     */
    HandlerEvents_proxylinuxsysinfo_msg_get(_topic, _msg) {
        const source_name = 'HubLow';

        const channel = this.#_SourceMapNames.find(obj => obj.chNum == _msg.arg[1] && obj.source == source_name);

        if (channel != undefined) {
            const ch_name = channel.Name;

            const msg = {
                dest: ch_name,
                com: COM_ALL_DATA_RAW_GET,
                arg: [source_name],
                value: [{
                    com: COM_ALL_DATA_RAW_GET,
                    arg: [ch_name],
                    value: [_msg.value[0]]
                }]
            }
            this.EmitMsg(this.#_PrimaryBus, msg.com, msg);
        }
    }
}

module.exports = ProxyLinuxSysinfo;