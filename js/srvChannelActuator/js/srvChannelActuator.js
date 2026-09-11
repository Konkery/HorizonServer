const ClassChannel_S = require('../../srvChannel/js/srvChannel');

const COM_CH_ALARM = 'all-ch-alarm';
// ### ПОДПИСКИ
const COM_ALL_DEVINFO_SET = 'all-device-config-set';
const COM_DM_DEVLIST_SET = 'dm-deviceslist-set';
const COM_ALL_INIT1 = 'all-init-stage1-set';
const COM_ALL_CLOSE = 'all-close';
const COM_DM_NEW_CH = 'dm-new-channel';
const COM_ALL_ACT_SET = 'all-actuator-set';
const COM_ALL_DATA_FINE_SET = 'all-data-fine-set';
const COM_ALL_DATA_FINE_GET = 'all-data-fine-get';
const COM_ALL_DATA_RAW_GET = 'all-data-raw-get';

const STATUS_ACTIVE = 'active';
const STATUS_INACTIVE = 'inactive';
const CONST_UNKNOWN = 'unknown';

const COM_ALL_CH_STATUS_GET = 'all-ch-status-get';
const COM_ALL_CH_STATUS_SET = 'all-ch-status-set';

const VALUE_TYPE_NUMBER = 'number';
const VALUE_TYPE_STRING = 'string';
const VIRTUAL_SOURCE_NAME = 'virtual';
/**
 * @typedef SensorOptsType 
 * @property {String} name
 * @property {String} article
 * @property {String} module
 * @property {string} description
 * @property {String} type
 * @property {[String]} channelNames
 * @property {[String]} channelMeasures
 */

/**
 * @class 
 * Самый "старший" предок в иерархии классов актуаторов. 
 * В первую очередь собирает в себе его описательную характеристику: имя, тип вх. и вых. сигналов, типы шин которые можно использовать, количество каналов и тд.
 */
class ClassActuatorInfo {
    /**
     * @constructor
     * @param {SensorOptsType} _opts - объект с описательными характеристиками датчика и параметрами, необходимых для обеспечения работы датчика
     */
    constructor(_opts) {
        this._Id = _opts.id;
        this._Name = _opts.name;
        this._Module = _opts.module;
        this._Type = 'sensor';
        this._Article = _opts.article;
        this._Description = _opts.description;
        this._QuantityChannel = _opts.quantityChannel;
        this._ChannelNames = _opts.channelNames;
        this._ChannelMeasures = _opts.channelMeasures;
    }

    get Name() { return this._Name; }

    get Article() { return this._Article; }

    get ChannelNames() { return this._ChannelNames; }

    get Description() { return this._Description; }

    get ChannelMeasures() { return this.ChannelMeasures; }
}
/**
 * @class
 * Класс, представляющий каждый отдельно взятый канал датчика.
 */
class ClassChannelActuator extends ClassChannel_S {
    #_Value;
    #_ValueConfirm;
    /**
    * @typedef TypeServiceOpts
    * @property {[ClassBus_S]} _busList
    * @property {[string]} _busNameList
    * @property {TypeChOpts} _advOpts 
    */
    /**
    * @constructor 
    * @param {TypeServiceOpts} _serviceOpts 
    */
    constructor({ _busList, _busNameList, _advOpts }) {
        // имя службы идентично id канала
        // const service_name = `${_advOpts.SourceName}-${_advOpts.DeviceId}-${_advOpts.ChNum}`;
        // const service_name = _advOpts.Name;
        super({ _busNameList, _busList, _advOpts });
        this.#_ValueConfirm = _advOpts.ValueConfirm ?? false;
        /****** */
        this.SetupMathChannel(_advOpts);
        this.FillEventOnList('dataBus', [COM_ALL_ACT_SET]);
    }

    get Value() {
        return this.#_Value;
    }

    /**
     * @method
     * @public
     * @description Обработчик команды на инициализацию службы
     * @param {string} _topic 
     * @param {ClassBusMsg_S} _msg 
     */
    HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);
        const busName = this.SourceName == VIRTUAL_SOURCE_NAME ? 'dataBus': this.ProtocolBusName;
        this.FillEventOnList(busName,
            this.#_ValueConfirm ? [COM_DM_DEVLIST_SET, COM_ALL_DATA_RAW_GET] : [COM_DM_DEVLIST_SET]);
        
        this.FillEventOnList('dataBus', this.StateChName 
            ? [COM_ALL_DATA_FINE_SET, COM_ALL_DATA_FINE_GET] 
            : [COM_ALL_DATA_FINE_GET]);

        this.EmitEvents_dm_new_channel();
        this.EmitEvents_all_ch_new();
    }

    /**
     * @method
     * Метод обязывает запустить работу актуатора
     * @param {Number} _freq
     * @returns {Boolean} 
     */
    SetValue(_val, _opts) {
        this._SetValueTime = new Date().getTime();
        // if (this.Status != STATUS_ACTIVE) return;
        let val = _val;
        if (!this.#_ValueConfirm && this.SavingValues.raw)
            this.EmitEvents_providermdb_data_write({ arg:['raw'], value: [val] });

        if (this.ValueType == VALUE_TYPE_NUMBER) {
            val = this.Suppression.SuppressValue(_val);
            val = this.Transform.TransformValue(val);

            if (this.Alarms) this.Alarms.CheckZone(val);
        }

        if (!this.#_ValueConfirm) {
            this.#_Value = val;

            this.EmitEvents_all_data_fine_set({ value: [this.#_Value] });
            if (!this.#_ValueConfirm && this.SavingValues.fine)
                this.EmitEvents_providermdb_data_write({ arg: ['fine'], value: [val] });
        }

        this.EmitEvents_proxy_send({ value: [val] })
    }

    /**
 * @method
 * @public
 * @description 
 * @param {string} _topic 
 * @param {ClassBusMsg_S} _msg 
 */
    HandlerEvents_all_data_raw_get(_topic, _msg) {
        this._allDataRawGetTime = new Date().getTime();
        try {
            const [source_name] = _msg.arg;
            const [ch_name] = _msg.value[0].arg;
            if ((ch_name === this.NamePLC || ch_name === this.Name) && source_name === this.SourceName) {
                this.#_Value = _msg.value[0]?.value[0];

                this.EmitEvents_all_data_fine_set({ value: [this.#_Value] });
                if (this.SavingValues.fine)
                    this.EmitEvents_providermdb_data_write({ arg: ['fine'], value: [this.#_Value] });
            }
        } catch (e) {
            this.EmitEvents_logger_log({ msg: `Error while processing data-raw msg`, level: 'E', obj: _msg });
        }
    }

    /**
     * @method
     * Метод предназначен для предоставления дополнительных сведений об измерительном канале или физическом устройстве.
     * @param {Object} _opts - параметры запроса информации.
     */
    GetInfo(_opts) {
        return this.DeviceInfo.GetInfo?.(this.ChNum, _opts);
    }
    /**
     * @method
     * @description Вызывает команду изменения состояния актуатора при обновление сенсорного state-канала. 
     * @param {string} _topic 
     * @param {*} _msg 
     */
    HandlerEvents_all_data_fine_set(_topic, _msg) {
        const [chName] = _msg.arg;
        if (chName == this.StateChName) {
            const [{ Value, ValueSuppressed }] = _msg.value;
            if (!ValueSuppressed)
                this.SetValue(Value);
        }
    }

    HandlerEvents_all_data_fine_get(_topic, _msg) {
        const [chName] = _msg.arg;
        if (chName == this.Name) {
            this.EmitEvents_all_data_fine_set({ value: [this.Value] });
        }
    }

    /**
     * @method
     * @public
     * @description Вызывает команду изменения состояния актуатора согласно полученной команде 'all-actuator-set'
     * @param {string} _topic 
     * @param {*} _msg 
     */
    HandlerEvents_all_actuator_set(_topic, _msg) {
        this._allActuatorSetTime = new Date().getTime();
        const [ch_name] = _msg.arg;
        const [val_input] = _msg.value;
        if (ch_name === this.Name/* && typeof val_input == 'number'*/)
            this.SetValue(val_input);
    }

    /**
     * @method
     * @public
     * @description Отправляет на прокси-службу команду на изменение значения актуатора
     * @param {*} param0 
     */
    EmitEvents_proxy_send({ value }) {
        // поиск прокси-службы источника, считывание PrimaryBus
        const proxy_name = Object.values(this.ServicesState).find(_service => _service.Name.includes('proxy') && _service.Protocol === this.Protocol).Name;
        // выбор команды proxywscient-send | proxymqttclient-send | ...
        if (!proxy_name) {
            this.EmitEvents_logger_log({ level: 'E', msg: `Proxy service not found`, obj: this });
            return;
        }
        const com_send = `${proxy_name}-send`;

        const msg = {
            dest: proxy_name,
            com: com_send,
            arg: [this.SourceName],
            value: [{
                arg: [this.Protocol === 'lhp' ? this.NamePLC : this.Name],
                value
            }]
        }

        this.EmitMsg(this.ProtocolBusName, com_send, msg);
    }

    /**
     * @method
     * @public
     * @description Отправляет на dataBus сообщение со значением канала
     */
    EmitEvents_all_data_fine_set({ value }) {
        const msg = {
            dest: 'all',
            com: COM_ALL_DATA_FINE_SET,
            arg: [this.Name],
            value: [{
                Name: this.Name,
                Value: value[0],
                ChName: this.ChName,
                ChAlias: this.ChAlias,
                ChMeas: this.ChMeas,
                CurrZone: this.Alarms?.CurrZone
            }]
        }
        this.EmitMsg('dataBus', msg.com, msg);
    }
}

module.exports = ClassChannelActuator;