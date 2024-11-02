db.projectData.aggregate([
    {
        $match: {
            "sources.Name": "plc11"
        }
    },
    {
        $unwind: "$sources"  // Разворачиваем массив sources
    },
    {
        $match: {
            "sources.Name": "plc11"  // Фильтруем только нужный объект
        }
    },
    {
        $replaceRoot: { newRoot: "$sources" }  // Заменяем корень на найденный объект
    }
])
