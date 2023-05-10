import {Database} from "./firebase-loader.js";
import {findGreenlight} from "./findGreenlight.js";

let initialURL = new URL(window.location.href);

function cleanup() {
    let root = document.querySelector("#croquet-root");
    if (root) {
        root.style.setProperty("display", "inherit");
    }
    window.Database = Database;
}

function initialURLCheck() {
    let maybeDuplicate = initialURL.searchParams.get("duplicate");
    if (maybeDuplicate) {
        let r = initialURL.searchParams.get("r");
        if (r) {
            return new Promise((resolve, reject) => {
                Database.getBoardInfo(r).then((boardInfo) => {
                    resolve({action: "duplicate", board: boardInfo, name: maybeDuplicate, team: boardInfo.team});
                }).catch((error) => {
                    reject(error);
                });
            });
        }
        return Promise.resolve(null);
    }

    let maybeLaunch = initialURL.searchParams.get("launch");
    if (maybeLaunch) {
        return new Promise((resolve, reject) => {
            Database.getBoardInfo(maybeLaunch).then((boardInfo) => {
                resolve({action: "launch", board: boardInfo});
            }).catch((error) => {
                reject(error);
            });
        });
    }
    let maybeLaunched = initialURL.searchParams.get("launched");
    if (maybeLaunched) {
        if (window.parent !== window) {
            let r = initialURL.searchParams.get("r");
            if (r) {
                return Promise.resolve({action: "done", board: {id: r}});
            }
        }
    }
    return Promise.resolve(null);
}

function findAndLoad(options, moreOptions) {
    return findGreenlight().then((loadGreenlight) => {
        loadGreenlight(() => {
            cleanup();
        }, options, moreOptions);
    });
}

function init() {
    Database.initDatabase().then(() => {
        return Database.getUser();
    }).then(() => {
        initialURLCheck().then((info) => {
            let options = {
                nickname: "A", walletname: "public", initials: "AA",
                userColor: "#FF00FF", sessionName: info.board.id,
                chat: "off", mic: "off", video: "off",
            };

            if (info && info.action === "duplicate") {
                Database.addBoard(info.name, info.team).then((boardData) => {
                    findAndLoad(options, {newId: boardData.data.id});
                });
            }
            if (info && info.action === "launch") {
                findAndLoad(options, {launch: info.board.id});
            }
            if (info && info.action === "done") {
                window.top.postMessage({duplicatorAction: "done", id: info.board.id});
            }
        });
    }).catch((error) => {
        console.log("not signed in", error);
    });
}

window.onload = init;
