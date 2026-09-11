const ClassProxyActuatorDriver_S = require('../../srvProxyActuatorDriver/js/srvProxyActuatorDriver.js');
const THIS_NAME = 'proxymhbridge';
const PROTOCOL = 'mhbridge';
const CLIENT_NAME = 'mhbridge';

const EVENT_PRIMBUS_LIST = ['proxymhbridge-send', 'proxymhbridge-res', 'proxymhbridge-cmd'];
const BUS_NAMES_LIST = ['mhbridgeBus', 'dataBus'];

const COM_ALL_DATA_FINE_SET = 'all-data-fine-set';

const EVENT_SYSBUS_LIST = ['all-init-stage1-set', 'test-connect'];

class ClassProxyModBusHBridgeMotor_S extends ClassProxyActuatorDriver_S {
    /**
     * @constructor
     * @description
     * Конструктор класса прокси логгера
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ _busList, _primaryBus, _node }) {
        super({
            _name: THIS_NAME,
            _busList,
            _primaryBus,
            _node,
            _clientName: CLIENT_NAME,
            _protocol: PROTOCOL,
            _busNamesList: BUS_NAMES_LIST,
        });
        /** @type {Map<string, import('../../srvHBridgeMotor/js/srvHBridgeMotor').IHBridgeConfig>}   */
        this._SourcesOpts = new Map();
        this.FillEventOnList('sysBus', EVENT_SYSBUS_LIST);
        this.FillEventOnList(this.PrimaryBus, EVENT_PRIMBUS_LIST);
        this.FillEventOnList('dataBus', [COM_ALL_DATA_FINE_SET]);
        // this.EmitEvents_logger_log({ level: 'I', msg: 'ProxyModbusHBridgeMotor initialized.' });
    }

    GetSourceByChName(chName) {
        for (const [sourceName, { channels }] of this._SourcesOpts.entries()) {
            if (channels?.includes?.(chName))
                return sourceName;
        }
    }

    /**
     * @method HandlerEvents_all_init_stage1_set
     * @async
     * @description Обработчик события инициализации stage 1. Извлекает и сохраняет настройки источников.
     * @param {string} _topic - Тема события.
     * @param {object} _msg - Содержимое сообщения.
     */
    async HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);

        for (let source of this.Sources()) {
            this._SourcesOpts.set(source.Name, source.AdvOpts);
        }
    }

    HandlerEvents_proxymhbridge_send(_topic, _msg) {
        this.HandlerEvents_send(_msg);
    }

    HandlerEvents_proxymhbridge_res(_topic, _msg) {
        this.HandlerEvents_res(_msg);
    }
    
    HandlerEvents_proxymhbridge_cmd(_topic, _msg) {
        const src = _msg.metadata.source;
        if (src != this.ClientName) return;

        const sourceName = _msg.arg[0];
        const chNum = _msg.value[0].arg[0];
        const value = _msg.value[0].value[0];
        const chName = this._SourcesOpts.get(sourceName)?.channels?.[chNum];
        if (!chName) return;
        this.EmitEvents_all_actuator_set(chName, value);
        this.EmitEvents_all_data_fine_get(chName);
    }

    HandlerEvents_all_data_fine_set(_topic, _msg) {
        try {
            const chName = _msg.arg[0];
            const sourceName = this.GetSourceByChName(chName);
            if (!sourceName) return;
            const { Value } = _msg.value[0]; 
            const chNum = this._SourcesOpts.get(sourceName)?.channels?.indexOf(chName);
            if (chNum > -1)
                this.EmitEvents_mhbridge_ch_set(sourceName, chNum, Value);   
        } catch (e) {
            this.EmitEvents_logger_log({ msg: `Error while processing data-fine msg`, level: 'E', obj: _msg });
        }
    }

    EmitEvents_mhbridge_ch_set(sourceName, chNum, value) {
        const msg = {
            dest: this.ClientName,
            com: `${this.ClientName}-ch-set`,
            arg: [sourceName],
            value: [{
                arg: [chNum],
                value: [value]
            }]
        }
        this.EmitMsg(this.PrimaryBus, msg.com, msg);
    }
}

module.exports = ClassProxyModBusHBridgeMotor_S;