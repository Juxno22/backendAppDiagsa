function errorHadler(err, req, res, next){
    console.error(err.stack)
    res.status(500).json({error: 'Algo salio mal en el servidor', message: err.message})
}

module.exports = errorHadler