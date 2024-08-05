/*
 *	 Создать суперпользователя в СУБД в БД 'admin', с правами администратора всех БД сервера

db.createUser(
	{
		user:"root",
		pwd:"root",
		roles:["root"]
	})*/

/*
 *	 Создать пользователя в БД 'frameWork1', с правами администратора данной БД
*/
db.createUser(
	{
		user:"operator1",
		pwd:"pass12",
		roles:[{role: "dbOwner" , db:"frameWork1"}]
});
use frameWork1;
/*
 *	Создать коллекцию типа 'timeseries' в БД 'frameWork1', со сроком жизни данных
 *	10 суток. С требованием индексировать только те документы у которых есть поле
 *	'value'.
*/
db.createCollection("rawData", {
  timeseries: {
    timeField: "timestamp",
    metaField: "metadata"
  },
  partialFilterExpression: {
    value: { $exists: true }
  },
  expireAfterSeconds: 864000
});

