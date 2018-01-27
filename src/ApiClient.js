import rp from "request-promise";

import logger from "./logger";

const MAP_CALL_FAILED = "Unable to call key value management endpoint.";
const CSRF_CALL_FAILED = "Unable to retrieve CSRF token.";
const PROXY_CALL_FAILED = "Unable to call API proxy management endpoint.";

const MAP_ENTITY_SET_URL = "/Management.svc/KeyMapEntries";
const PROXY_BASE_URL = "/Transport.svc/APIProxies";

const CSRF_HEADER = "x-csrf-token";

function odataLiteral(literal) {
    return "'" + (literal || "").replace("'", "''") + "'";
}

function wrapError(err, msg) {
    let message;
    if (!err) {
        message = msg;
    } else if (err.response) {
        message = msg + " Response status: " + err.response.statusCode + ". " + 
            (typeof err.response.body === "string" ? err.response.body : JSON.stringify(err.response.body));
    } else {
        message = msg + " " + err.toString();
    }
    logger.error(message);
    throw new Error(message);
}

function urlForSingleMap(name) {
    return MAP_ENTITY_SET_URL + "(" + odataLiteral(name) + ")";
}

export default class ApiClient {
    constructor(config) {
        if (!config.host || !config.username || !config.password) {
            throw new Error("The API Portal username, password and host are mandatory configuration attributes.");
        }
        let base = rp.defaults({
            baseUrl: "https://" + config.host + "/apiportal/api/1.0",
            jar: true,
            proxy: config.proxy,
            resolveWithFullResponse: true,
            auth: {
                username: config.username,
                password: config.password
            }
        });
        this.client = base.head({uri: "/Management.svc", headers: {[CSRF_HEADER]: "fetch"}})
            .then(r => base.defaults({headers: {[CSRF_HEADER]: r.headers[CSRF_HEADER] || ""}}))
            .catch(r => wrapError(r, CSRF_CALL_FAILED));
    }

    deleteMap(name) {
        return this.client.then(client => client.delete(urlForSingleMap(name)))
            .then(() => logger.debug("Successfully deleted map: " + name + "."))
            .catch(r =>  (r && r.response && r.response.status) === 404 ? null : wrapError(r, MAP_CALL_FAILED));
    }

    createMap(name, content) {
        return this.client.then(client => client.post({uri: MAP_ENTITY_SET_URL, body: content, json: true}))
            .then(() => logger.debug("Successfully created map: " + name + "."))
            .catch(r => wrapError(r, MAP_CALL_FAILED));
    }

    uploadProxy(data) {
        return this.client
            .then(client => client.post({
                uri: PROXY_BASE_URL, 
                body: data, 
                headers: {"Content-Type": "application/octet-stream"}
            }))
            .then(() => logger.debug("Successfully uploaded proxy archive."))
            .catch(r => wrapError(r, PROXY_CALL_FAILED));
    }

    downloadProxy(name) {
        return this.client
            .then(client => ({stream: client.get({uri: PROXY_BASE_URL, qs: {name}, encoding: null})}))
            .then(r => {logger.debug("Successfully downloaded proxy archive: " + name + "."); return r;})
            .catch(r => wrapError(r, PROXY_CALL_FAILED));
    }
}