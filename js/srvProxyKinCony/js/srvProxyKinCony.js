const ClassBaseService_S = require('./../../srvService/js/srvService');

const COM_ALL_DATA_RAW_GET = 'all-data-raw-get';

const EVENT_SYSBUS_LIST = ['all-init-stage1-set', 'source-connect'];

class ProxyKinCony extends ClassBaseService_S {
    #_SourceMapNames;
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
    constructor({ _busList, _primaryBus, _node, _protocol, _Name }) {
        super({ _name: _Name, _busNameList: ['sysBus', _primaryBus, 'logBus'], _busList, _node });
        this.#_SourceMapNames = [];
        this.#_Protocol = _protocol;
        this.#_PrimaryBus = _primaryBus;
        this.#_Name = _Name;
        this.#_dest = `modbusKCS${this.#_Name.includes('2') ? '2' : ''}`;
        this.#_com = `modbusclientkcs${this.#_Name.includes('2') ? '2' : ''}-send`;

        this[`HandlerEvents_${this.#_Name}_send`] = this.HandlerEvents_proxymodbuskcs_send.bind(this);
        this[`HandlerEvents_${this.#_Name}_msg_get`] = this.HandlerEvents_proxymodbuskcs_msg_get.bind(this);

        this.FillEventOnList('sysBus', EVENT_SYSBUS_LIST);
        this.FillEventOnList(this.#_PrimaryBus, [`${this.#_Name}-send`, `${this.#_Name}-msg-get`]);
        this.EmitEvents_logger_log({level: 'I', msg: 'ProxyModbusKCS initialized.'});       
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
    HandlerEvents_proxymodbuskcs_send(_topic, _msg) {
        const source_name = _msg.metadata.source;
        const source = this.#_SourceMapNames.find(_obj => _obj.Name === source_name);

        if (source != undefined) {
            this.EmitEvents_modbusclientkcs_send({ arg: [source.source, source.chNum], value: [_msg.value[0]]});
        }
    }

    /**
     * @method 
     * @description Вызывается при обработке события 'proxywsc_msg_get', который инициируется WSC
     * @param {string} _topic - команда
     * @param {ClassBusMsg_S} _msg - сообщение
     */
    HandlerEvents_proxymodbuskcs_msg_get(_topic, _msg) {
        const source_name = _msg.arg[0];

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
    /**
     * @method
     * @public
     * @description Отправляет на MQTT Client запрос на отправку сообщения на брокер
     * @param {*} param0 
     */
    EmitEvents_modbusclientkcs_send({ arg, value }) {
        const msg = {
            dest: this.#_dest,
            com: this.#_com,
            arg,
            value
        }
        
        this.EmitMsg(this.#_PrimaryBus, msg.com, msg);
    }
}

module.exports = ProxyKinCony;