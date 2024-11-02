const ClassBaseService_S = require('srvService');
const { exec } = require('node:child_process');

// ИМЕНА ШИН
const BUS_NAME_LIST = ['sysBus', 'logBus', 'rpiBus'];

// СПИСКИ ТОПИКОВ/КОМАНД 
const RPIC_MSG_GET     = 'rpiclient-msg-get';
const PRPIC_MSG_GET     = 'proxyrpiclient-msg-get';
const COM_PRPIC_MSG_GET = 'proxyrpiclient-msg-get';

// СПИСКИ ПОДПИСОК
const EVENT_ON_LIST_SYSBUS = ['all-init-stage1-set', 'all-close'];
const EVENT_ON_LIST_RPIBUS = [RPIC_MSG_GET];

// СПИСКИ ИСХ.СОБЫТИЙ 
const EVENT_EMIT_PROXYRPI_LIST = [PRPIC_MSG_GET];
/********************************* */

/**
 * @class
 * Реализует функционал прокси к функциональным узлам, собирающим данные о хабе
 */
class ClassRpiClient_S extends ClassBaseService_S {
    #_Rpi;    
    #_Interval;
    #_ChFuncList = {
        'rpi-0': { get: this.GetTmprt.bind(this) },
        'rpi-1': { get: this.GetCPULoad.bind(this)  },
        'rpi-2': { get: this.GetTotalMem.bind(this) },
        'rpi-3': { get: this.GetUsedMem.bind(this)  },
        'rpi-4': { get: this.GetFreeMem.bind(this)  },
        'rpi-5': { get: this.GetAvailMem.bind(this) }
    };
    /**
     * @constructor
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     * @param {[string]} chList - список каналов хаба 
     */
    constructor({ _busList, _node }) {
        // передача в супер-конструктор имени службы и списка требуемых шин
        super({ _name: 'rpiclient', _busNameList: BUS_NAME_LIST, _busList, _node });
        this.FillEventOnList('sysBus', EVENT_ON_LIST_SYSBUS);
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
                else res(stdout.trimEnd());
            });
        });
    }
    /**
     * @method
     * @description обработка события init1
     * Получение имени
     * @param {string} _topic 
     * @param {ClassBusMsg_S} _msg 
     */
    async HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);

        this.#_Rpi = Object.values(this.SourcesState).find(_source => _source.Protocol === 'rpi');

        this.#_Rpi.CheckClient = true;
        this.StartPolling();
    }
    /**
     * @method
     * @description 
     * @param {string} _topic 
     * @param {object} _msg 
     */
    async HandlerEvents_rpiclient_data_get(_topic, _msg) {
        const rpiName = _msg.arg[0];
        const rpiData = _msg.value[0];

        this.EmitEvents_proxyrpiclient_msg_get({ value: [rpiData], arg: [rpiName] });
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
    async EmitEvents_proxyrpiclient_msg_get({ value, arg }) { 
        const msg_to_proxy = this.CreateMsg({
            dest: 'proxyrpiclient',
            com: PRPIC_MSG_GET,
            arg,
            value
        });

        return this.EmitMsg('rpiBus', PRPIC_MSG_GET, msg_to_proxy);
    }
    /**
     * @typedef TypeCollectedChData
     * @property {[string]} arg
     * @property {[number]} value
     */

    /**
     * @method
     * @public
     * @description Запускает циклический опрос виртуальных каналов клиента с отправкой всех успешно полученных значений на 'proxyrpiclient' 
     */
    async StartPolling() {
        this.#_Interval = setInterval(async () => {
            const ch_id_list = Object.keys(this.#_ChFuncList);
            ch_id_list.forEach(_id => {
                const get_data_func = this.#_ChFuncList[_id].get;
                try {
                    get_data_func().then(_val => {
                        
                        const msg = {
                            dest: 'proxyrpiclient',
                            com: COM_PRPIC_MSG_GET,
                            arg: [this.#_Rpi.Name],
                            value: [ { arg: [_id], value: [_val] } ]
                        }
                        this.EmitMsg('rpiBus', msg.com, msg);
                    });
                } catch (e) {
                    this.EmitEvents_logger_log({ level: 'E', msg: `Error while trying to read ${_id}`, obj: e });
                }
            });
        }, 5000)
    }
    HandlerEvents_all_close(_topic, _msg) {
        super.HandlerEvents_all_close(_topic, _msg);

        this.HandlerEvents_rpiclient_stop_polling();
    }
    /**
     * @method
     * @public
     * @description
     */
    HandlerEvents_rpiclient_stop_polling(_topic, _msg) {
        clearInterval(this.#_Interval);
    }
    /**
     * @method
     * @public
     * @description Возвращает промис, разрешающийся со значением температуры чипа.
     * Выполняет команду `sudo vcgencmd measure_temp`
     * @returns {Promise}
     */
    async GetTmprt() {
        // return getDataDummy();
        // return this.#Exec('sudo vcgencmd measure_temp').then(_res => +(_res?.substring(5,9)));
        return new Promise((res, rej) => {
            setTimeout(() => {
                res(Math.floor(Math.random()*100));
            }, 0);
        });
    }
    /**
     * @method
     * @public
     * @description Возвращает промис, разрешающийся со значением загрузки CPU.
     * Выполняет команду `top -d 0.5 -b -n2`
     * @returns {Promise}
     */
    async GetCPULoad() {
        return this.#Exec(`top -d 0.5 -b -n2 | grep "Cpu(s)"|tail -n 1 | awk '{print $2 + $4}'`)
            .then(_res => parseFloat(_res));
    }
    /**
     * @method
     * @public
     * @description Возвращает промис, разрешающийся с кол-вом общей памяти.
     * Выполняет команду `free | grep Mem`
     * @returns {Promise}
     */
    async GetTotalMem() {
        return this.#Exec(`free | grep Mem | awk '{print $2 / 1000000}'`)
            .then(_res => parseFloat(_res));
    }
    /**
     * @method
     * @public
     * @description Возвращает промис, разрешающийся с кол-вом используемой памяти.
     * Выполняет команду `free | grep Mem`
     * @returns {Promise}
     */
    async GetUsedMem() {
        return this.#Exec(`free | grep Mem | awk '{print $3 / 1000000}'`)
            .then(_res => parseFloat(_res));
    }
    /**
     * @method
     * @public
     * @description Возвращает промис, разрешающийся с кол-вом свободной памяти.
     * Выполняет команду `free | grep Mem`
     * @returns {Promise}
     */
    async GetFreeMem() {
        return this.#Exec(`free | grep Mem | awk '{print $4 / 1000000}'`)
            .then(_res => parseFloat(_res));
    }
    /**
     * @method
     * @public
     * @description Возвращает промис, разрешающийся с кол-вом доступной памяти.
     * Выполняет команду `free | grep Mem`
     * @returns {Promise}
     */
    async GetAvailMem() {
        return this.#Exec(`free | grep Mem | awk '{print $7 / 1000000}'`)
            .then(_res => parseFloat(_res));
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