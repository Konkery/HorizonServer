const ClassBaseService_S = require('./../../srvService/js/srvService');

const COM_ALL_DATA_RAW_GET = 'all-data-raw-get';

EVENT_SYSBUS_LIST = ['all-init-stage1-set', 'source-connect'];
EVENT_MODBUS_LIST = ['proxymodbusrot-send', 'proxymodbusrot-msg-get'];
const TYPES = ['RTU','TCP','ROT'];
const SHORT_TYPES = ['rtu', 'tcp', 'rot'];
const PROTOCOLS = ['modbusrtu','modbustcp','modbusrot'];

class ProxyModbusBase extends ClassBaseService_S {
    #_SourceMapNames;
    #_Type;
    #_SType;
    #_PrimaryBus;
    #_Protocol;
    /**
     * @constructor
     * @description
     * Конструктор класса
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ _name, _busNameList, _primaryBus, _protocol, _busList, _node, _type }) {
        super({ _name: _name, _busNameList: _busNameList, _busList, _node });
        this.#_SourceMapNames = [];
        this.#_Type = _type.toUpperCase();
        this.#_PrimaryBus = _primaryBus;
        this.#_Protocol = _protocol;

        if (!TYPES.includes(this.#_Type)) {
            this.EmitEvents_logger_log({level: 'W', msg: `Unsupported modbus client type: ${this.#_Type}\nDefaulting to TCP`});
            this.#_Type = "TCP";
        };

        this.#_SType = SHORT_TYPES[TYPES.indexOf(this.#_Type)];

        this.FillEventOnList('sysBus', EVENT_SYSBUS_LIST);
        this.FillEventOnList(this.#_PrimaryBus, [`proxymodbus${this.#_SType}-send`, `proxymodbus${this.#_SType}-msg-get`]);
        this.EmitEvents_logger_log({level: 'I', msg: `ProxyModbus${this.#_Type} initialized.`});
    }

    /**
     * @method
     * @description Обрабатывает событие all-init-stage1-set
     * @param {Object} _topic         - Топик сообщения 
     * @param {Object} _msg           - Сообщение
     */
    HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);

        Object.values(this.SourcesState)
            .filter(_source => _source.Protocol === this.#_Protocol)  
            .forEach(_source => {
                _source.CheckProxy = true;
                _source.PrimaryBus = this.#_PrimaryBus;
            });
    }

    /**
     * @method
     * @description Обрабатывает событие source-connect
     * @param {Object} _topic         - Топик сообщения 
     * @param {Object} _msg           - Сообщение
     */
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
     * @description Запускает событие для передачи сообщения на соответствующую службу клиента
     * @returns msg         - отправляемое сообщение
     */
    EmitEvents_modbusclient_send({ arg, value }) {
        const msg = {
            dest: `modbusclient${this.#_SType}`,
            com: `modbusclient${this.#_SType}-send`,
            arg,
            value
        }
        this.EmitMsg(this.#_PrimaryBus, msg.com, msg);
    }

    /**
     * @method
     * @description Отправляет топик и значение, которое требуется записать
     * @param {Object} _topic         - Топик сообщения 
     * @param {Object} _msg           - Сообщение
     */
    Modbus_send_message ( _topic, _msg ) {
        const source_name = _msg.metadata.source;
        const source = this.#_SourceMapNames.find(_obj => _obj.Name === source_name);

        if (source != undefined) {
            this.EmitEvents_modbusclient_send({ arg: [_msg.arg, source.chNum], value: [_msg.value[0]]});
        }
        else {
            this.EmitEvents_logger_log({level: 'W', msg: `Cannot find ${source_name} to send message`});
        }
    }
    
    /**
     * @method
     * @description Обновляет значение канала
     * @param {Object} _topic         - Топик сообщения 
     * @param {Object} _msg           - Сообщение
     */
    Modbus_get_message ( _topic, _msg ) {
        const source_name = _msg.arg[0];
        let ch_num = _msg.arg[1].reg;

        if (source_name != undefined) {
            const data = _msg.value[0];

            data.data.forEach(d => {
                const ch = this.#_SourceMapNames.find(obj => obj.chNum == ch_num && obj.source == source_name);

                if (ch != undefined) {
                    const ch_name = ch.Name;

                    const msg = {
                        dest: ch_name,
                        com: COM_ALL_DATA_RAW_GET,
                        arg: [source_name],
                        value: [{
                            com: COM_ALL_DATA_RAW_GET,
                            arg: [ch_name],
                            value: [d]
                        }]
                    }
                    this.EmitMsg(this.#_PrimaryBus, msg.com, msg);
                }
                ch_num++;
            })
        }
        else {
            this.EmitEvents_logger_log({level: 'E', msg: `Cannot find ${source_name}`});
        }        
    }

}

module.exports = ProxyModbusBase;