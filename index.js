"use strict";

const path = require("path");
const fs = require("fs");
const JSTracing = require("./runtime");

exports.packageType = "content-type";
exports.namespace = "jstracing";
exports.register = function registerJSTracingType(handlers, app, config) {
  const defaultToolsJarPath = path.join(__dirname, "static", "assets", "tools.jar");
  const configuredToolsJarPath = process.env.JSTRACING_TOOLS_JAR_PATH ||
    (config && config.jstracingToolsJarPath) ||
    defaultToolsJarPath;
  const toolsJarPath = String(configuredToolsJarPath).trim();
  let resolvedToolsJarPath = toolsJarPath ? path.resolve(toolsJarPath) : defaultToolsJarPath;

  if (!fs.existsSync(resolvedToolsJarPath) || !fs.statSync(resolvedToolsJarPath).isFile()) {
    if (resolvedToolsJarPath !== defaultToolsJarPath && fs.existsSync(defaultToolsJarPath)) {
      console.warn("[acos-jstracing-type] WARN: configured tools.jar not found at", resolvedToolsJarPath, "- using", defaultToolsJarPath);
      resolvedToolsJarPath = defaultToolsJarPath;
    }
  }

  const toolsJarExists = fs.existsSync(resolvedToolsJarPath) && fs.statSync(resolvedToolsJarPath).isFile();

  // CheerpJ maps virtual /app/tools.jar to the HTTP /tools.jar endpoint.
  if (app && typeof app.get === "function" && toolsJarExists) {
    const serveToolsJar = function(req, res) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "*");
      if (req.method === "OPTIONS") {
        return res.sendStatus(204);
      }
      res.sendFile(resolvedToolsJarPath);
    };

    if (typeof app.all === "function") {
      app.all("/tools.jar", serveToolsJar);
      app.all("/static/jstracing/assets/tools.jar", serveToolsJar);
    } else {
      app.get("/tools.jar", serveToolsJar);
      app.get("/static/jstracing/assets/tools.jar", serveToolsJar);
    }
    console.log("[acos-jstracing-type] INFO: serving /tools.jar from", resolvedToolsJarPath);
  } else if (!toolsJarExists) {
    console.warn("[acos-jstracing-type] WARN: tools.jar was not found; Java compilation is unavailable.");
  }

  // Prefer remote CheerpJ runtime by default.
  // Set CHEERPJ_DISABLE_SELF_HOST=false to enable local self-host fallback explicitly.
  const disableSelfHostRaw = String(process.env.CHEERPJ_DISABLE_SELF_HOST || "true").trim().toLowerCase();
  const selfHostDisabled = disableSelfHostRaw === "1" ||
    disableSelfHostRaw === "true" ||
    disableSelfHostRaw === "yes" ||
    disableSelfHostRaw === "on";

  const cheerpjSelfHostDir = process.env.CHEERPJ_SELF_HOST_DIR ||
    (config && config.cheerpjSelfHostDir) ||
    path.join(__dirname, "static", "assets", "cheerpj", "4.3");
  if (!selfHostDisabled && app && typeof app.get === "function" && cheerpjSelfHostDir && fs.existsSync(cheerpjSelfHostDir)) {
    const selfHostRoot = path.resolve(cheerpjSelfHostDir);
    app.get("/static/cheerpj/4.3/*", function(req, res, next) {
      const requestedPath = path.resolve(selfHostRoot, req.params[0] || "");
      if (requestedPath !== selfHostRoot && requestedPath.indexOf(selfHostRoot + path.sep) !== 0) {
        return res.sendStatus(403);
      }
      fs.stat(requestedPath, function(err, stat) {
        if (err || !stat.isFile()) {
          return next();
        }
        return res.sendFile(requestedPath);
      });
    });
    console.log("[acos-jstracing-type] INFO: self-hosted CheerpJ fallback directory is", selfHostRoot);
  } else if (!selfHostDisabled && cheerpjSelfHostDir) {
    console.warn("[acos-jstracing-type] WARN: CHEERPJ_SELF_HOST_DIR not found, keep using remote runtime:", cheerpjSelfHostDir);
  }

  JSTracing.handlers = handlers;
  JSTracing.installedContentPackages = JSTracing.installedContentPackages || [];
  handlers.contentTypes.jstracing = JSTracing;
};
