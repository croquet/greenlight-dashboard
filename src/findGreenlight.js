async function findGreenlightPath() {
    // 1. try location/dir/meta/version txt
    //    if there is, return ./{hash}/greenlight.js
    //
    // 2. try location/dir/meta/greenlight.txt
    //    if there is, return the content  // ends with js
    //
    // 3. if neither found
    //    if there is, return "./greenlight.js
    let location = window.location;
    let ind = location.pathname.lastIndexOf("/");
    let dir = location.pathname.slice(0, ind);

    let tryFetch = (url) => fetch(url, {method: "GET", mode: "cors", headers: {"Content-Type": "text"}});

    let value;
    let url;
    url = `${location.protocol}//${location.host}${dir}/meta/version.txt`;

    value = await tryFetch(url).then((res) => res.text()).then((text) => {
        text = text.trim();
        if (text.length === 40 && !(/[^0-9a-f]+/.test(text))) {
            return text + "/greenlight.js";
        }
        return null;
    });

    if (value) {return value;}

    url = `${location.protocol}//${location.host}${dir}/meta/greenlight.txt`;
    value = await tryFetch(url).then((res) => res.text()).then((text) => {
        text = text.trim();
        if (text.endsWith(".js")) {
            return text;
        }
        return null;
    });

    if (value) {return value;}

    return "greenlight.js";
}

function greenlightLoader(dirPath) {
    return new Promise((resolve, _reject) => {
        if (document.querySelector("#greenlightLoader")) {
            return resolve();
        }
        let script = document.createElement("script");
        script.id = "greenlightLoader";
        script.src = dirPath;
        script.type = "module";
        document.body.appendChild(script);
        script.onload = () => {
            let loadGreenlight = window._loadGreenlight;
            let setPath = window._setPath;
            delete window._loadGreenlight;
            delete window._setPath;
            resolve({loadGreenlight, setPath});
        };
        script.onerror = () => {throw new Error("loader could not be loaded");};
        return script;
    });
}

export function findGreenlight() {
    let location = window.location;
    let ind = location.pathname.lastIndexOf("/");
    let dir = location.pathname.slice(0, ind);
    let dirPath;
    return findGreenlightPath().then((path) => {
        dirPath = `${location.protocol}//${location.host}${dir}/${path}`;
        return greenlightLoader(dirPath);
    }).then((mod) => {
        let dInd = dirPath.lastIndexOf("/");
        let pDir = dirPath.slice(0, dInd);
        mod.setPath(pDir);
        return mod.loadGreenlight;
    });
}
