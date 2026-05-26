function fechaMexicoYYYYMMDD(fecha = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(fecha);
}

function fechaHoraMexicoSQL(fecha = new Date()) {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(fecha);

    const map = Object.fromEntries(partes.map((p) => [p.type, p.value]));

    return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

module.exports = {
    fechaMexicoYYYYMMDD,
    fechaHoraMexicoSQL,
};