const ClassBaseService_S = require('./../../srvService/js/srvService');

const THIS_NAME = 'proxymodbusled';
const COM_ALL_DATA_RAW_GET = 'all-data-raw-get';

EVENT_SYSBUS_LIST = ['all-init-stage1-set', 'source-connect'];
EVENT_MODBUS_LIST = ['proxymodbusled-send', 'proxymodbusled-msg-get'];

class ProxyModbusLED extends ClassBaseService_S {
    #_SourceMapNames;
    #_Protocol;
    #_PrimaryBus;
    /**
     * @constructor
     * @description
     * Конструктор класса
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ _busList, _primaryBus, _node, _protocol }) {
        super({ _name: THIS_NAME, _busNameList: ['sysBus', _primaryBus, 'logBus'], _busList, _node });
        this.#_SourceMapNames = [];
        this.#_Protocol = _protocol;
        this.#_PrimaryBus = _primaryBus;
        this.FillEventOnList('sysBus', EVENT_SYSBUS_LIST);
        this.FillEventOnList(this.#_PrimaryBus, EVENT_MODBUS_LIST);
        this.EmitEvents_logger_log({level: 'I', msg: 'ProxyModbusLED initialized.'});
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
     * @public
     * @description Отправляет службе modbusclientled топик и значение, которое требуется записать
     * @param {string} _topic 
     * @param {*} _msg 
     */
    HandlerEvents_proxymodbusled_send(_topic, _msg) {
        const source_name = _msg.metadata.source;
        const source = this.#_SourceMapNames.find(_obj => _obj.Name === source_name);

        if (source != undefined) {
            this.EmitEvents_modbusclientled_send({ arg: [source.source, source.chNum], value: [_msg.value[0]]});
        }
    }
    /**
     * @method 
     * @description Вызывается при обработке события 'proxywsc_msg_get', который инициируется WSC
     * @param {string} _topic - команда
     * @param {ClassBusMsg_S} _msg - сообщение
     */
    HandlerEvents_proxymodbusled_msg_get(_topic, _msg) {
        // извлечение "ядра" сообщения, составленного службой контроллера
        // LHP.Unpack
        //const msg_from_plc = JSON.parse(_msg.value[0] ?? '');
        //const [ source_name ] = _msg.arg;
        //const hash = this.#GetMsgHash(msg_from_plc.com, source_name);
        const source_name = _msg.arg[0];
        const ch_name = this.#_SourceMapNames.find(obj => obj.chNum == _msg.arg[1] && obj.source == source_name).Name;

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
        //console.log(ch_name + ': ' + _msg.value[0]);
    }
    /**
     * @method
     * @public
     * @description Отправляет на MQTT Client запрос на отправку сообщения на брокер
     * @param {*} param0 
     */
    EmitEvents_modbusclientled_send({ arg, value }) {
        const msg = {
            dest: 'modbusclientled',
            com: 'modbusclientled-send',
            arg,
            value
        }
        this.EmitMsg(this.#_PrimaryBus, msg.com, msg);
    }
}

module.exports = ProxyModbusLED;