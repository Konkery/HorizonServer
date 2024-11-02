const ClassBaseService_S = require("../../../SrvService/js/module/srvService");

const BUS_NAME_LIST = ['sysBus', 'logBus', 'rpiBus'];

/** списки топиков/команд */
const RPIC_GET_MSG = 'rpiclient-get-msg';
const PRPI_GET_MSG = 'proxyrpi-get-msg';
// списки подписок
const EVENT_ON_LIST_NR = [RPIC_GET_MSG];
const EVENT_ON_LIST_RPIBUS = [RPIC_GET_MSG];

const EVENT_EMIT_PROXYRPI_LIST = [PRPI_GET_MSG];
/********************************* */

/**
 * @class
 * Реализует функционал прокси к функциональным узлам, собирающим данные о хабе
 */
class ClassRpiClient_S extends ClassBaseService_S {
    #_RpiSource;  
    #_HostName = 'unknown';    
    #_ChFuncList = {
        'rpi-00': { get: this.GetTmprt.bind(this), article: 'temp' },
        'rpi-01': { get: this.GetCPULoad.bind(this), article: 'cpu load' },
        'rpi-02': { get: this.GetFreeMem.bind(this), article: 'memory' }
    };
    /**
     * @constructor
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     * @param {[string]} chList - список каналов хаба 
     */
    constructor({ _busList, _node }) {
        // передача в супер-конструктор имени службы и списка требуемых шин
        super({ _name: 'rpiclient', _busNamesList: BUS_NAME_LIST, _busList, _node });
        // сохранение списка каналов
        this.GetHostName().then(_hostname => this.#_HostName = _hostname);
        this.FillEventOnList('nr', EVENT_ON_LIST_NR);
        this.FillEventOnList('rpiBus', EVENT_ON_LIST_RPIBUS);
    }
    /**
     * @method
     * возвращает имя хоста при успешном выполнении команды `hostname` 
     * @returns 
     */
    async GetHostName() {
        return new Promise((res, rej) => {
            exec('hostname', (err, stdout, stderr) => {
                if (err) rej(err);
                else res(stdout);
            });
        });
    }
    /**
     * @method
     * @description обработка события init1
     * Получение имени
     * @param {*} _topic 
     * @param {*} _msg 
     */
    async HandlerEvents_all_init1(_topic, _msg) {
        super.HandlerEvents_all_init1(_topic, _msg);

        this.#_RpiSource = this.SourcesState._Collection
            .find(source => source.Protocol === 'rpi');
        this.#_RpiSource.PrimaryBus = 'rpiBus';
        this.#_RpiSource.CheckClient = true;
    }
    /**
     * @method
     * @description Принимает данные данные о "каналах" хаба 
     * @param {string} _topic 
     * @param {object} _msg 
     */
    async HandlerEvents_rpiclient_data_get(_topic, _msg) {
        const rpiName = _msg.arg[0];
        const rpiData = _msg.value[0];

        this.EmitEvents_proxyrpi_msg_get({ value: [rpiData], arg: [rpiName] });
    }
    /**
     * @typedef EmitOpts 
     * @property {[string]} arg
     * @property {[any]} value
     */
    /**
     * @method
     * @description Отправляет на DM сообщение с raw data
     * @param {EmitOpts} param0 
     */
    async EmitEvents_proxyrpi_msg_get({ value, arg }) { 
        const msg_to_proxy = this.CreateMsg({
            dest: 'proxyrpi',
            com: PRPI_GET_MSG,
            arg,
            value
        });

        return this.EmitMsg('rpiBus', PRPI_GET_MSG, msg_to_proxy);
    }
    /**
     * @method
     * @private
     * @description
     * @param {[string]} _chIdList 
     * @returns {[Promise]}
     */
    async #GetDataPromiseList() {
        const ch_id_list = Object.keys(this.#_ChFuncList);
        return ch_id_list.map(ch_id => {
            const get_data_func = this.#_ChFuncList[ch_id].get;

            return new Promise(async (res, rej) => {
                try {
                    // чтение данных с устройства
                    let val = await get_data_func();
                    res({ arg: [ch_id],  value: [val] });
                } catch (e) {
                    // лог об ошибке
                    this.EmitEvents_logger_log(
                        { level: 'ERROR', msg: `Error while trying to read RPi data using ${get_data_func?.name}`, obj: e }
                    );
                    res(undefined);
                }
            });
        });
    }
    /**
     * @typedef TypeCollectedChData
     * @property {[string]} arg
     * @property {[number]} value
     */
    /**
     * @method
     * @public
     * @description Возвращает собранные значения каналов в формате `[ { arg: [<ch_id>], value: [x] }, ... ]`
     * @returns {Promise}
     */
    async GetCollectedData() {
        return new Promise((resolve, reject => {
            const promise_list = this.#GetDataPromiseList();

            Promise.all(promise_list).then(_results => {
                const data_list = _results.filter(_res => typeof _res?.value?.at(0) === 'number');
                resolve(data_list);
            });
        }));  
    }

    async StartPolling() {

        this._Interval = setInterval(async () => {
            this.GetCollectedData().then(_dataList => {
                _dataList.forEach(_chData => {
                    const msg = {
                        dest: 'proxyrpi',
                        com: 'proxyrpi-get-msg',
                        arg: [this.#_RpiSource.Name],
                        value: [_chData]
                    }
                    this.EmitMsg('rpiBus', msg.com, msg);
                });
            });

        }, 5000)
    }

    GetTmprt() {
        return this.#Exec('sudo vcgencmd measure_temp');
    }

    GetCPULoad() {
        return this.#Exec(`top -d 0.5 -b -n2 | grep "Cpu(s)"|tail -n 1 | awk '{print $2 + $4}'`);
    }

    GetFreeMem() {
        return this.#Exec(`free | grep Mem | awk '{print $4/$2 * 100.0}'`);
    }
    /**
     * 
     * @param {string} _command 
     * @returns {Promise}
     */
    #Exec(_command) {
        return new Promise((res, rej) => {
            exec(_command, (err, stdout, stderr) => {
                if (err) rej(err);
                else {
                    res(stdout);
                }
            });
        });
    }
}

module.exports = ClassRpiClient_S;