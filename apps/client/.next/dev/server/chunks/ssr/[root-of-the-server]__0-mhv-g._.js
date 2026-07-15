module.exports = [
"[externals]/react/jsx-dev-runtime [external] (react/jsx-dev-runtime, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("react/jsx-dev-runtime", () => require("react/jsx-dev-runtime"));

module.exports = mod;
}),
"[project]/packages/nav/dist/index.mjs [ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AppNav",
    ()=>AppNav,
    "portals",
    ()=>portals
]);
// src/AppNav.tsx
var __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$runtime$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/react/jsx-runtime [external] (react/jsx-runtime, cjs)");
// src/portals.config.ts
var portals = [
    {
        key: "scheduler",
        label: "Scheduler",
        url: "https://scheduler.summitclient.io"
    },
    {
        key: "clinician",
        label: "Clinician Portal",
        url: "https://data.summitclient.io"
    },
    {
        key: "employee",
        label: "Employee Portal",
        url: "https://employee.summitclient.io"
    },
    {
        key: "client",
        label: "Client Portal",
        url: "https://client.summitclient.io"
    }
];
;
function AppNav({ activeKey }) {
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$runtime$2c$__cjs$29$__["jsx"])("nav", {
        style: {
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 20px",
            background: "#1A3F5C",
            borderBottom: "1px solid #28B4A6"
        },
        children: portals.map((p)=>{
            const isActive = p.key === activeKey;
            return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$runtime$2c$__cjs$29$__["jsx"])("a", {
                href: p.url,
                style: {
                    fontSize: "13.5px",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "#28B4A6" : "#ffffffaa",
                    textDecoration: "none",
                    padding: "4px 12px",
                    borderRadius: "999px",
                    background: isActive ? "rgba(40,180,166,0.15)" : "transparent",
                    transition: "all 0.15s"
                },
                children: p.label
            }, p.key);
        })
    });
}
;
}),
"[project]/apps/client/pages/_app.tsx [ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>App
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/react/jsx-dev-runtime [external] (react/jsx-dev-runtime, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$nav$2f$dist$2f$index$2e$mjs__$5b$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/nav/dist/index.mjs [ssr] (ecmascript)");
;
;
;
function App({ Component, pageProps }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$nav$2f$dist$2f$index$2e$mjs__$5b$ssr$5d$__$28$ecmascript$29$__["AppNav"], {
                activeKey: "client"
            }, void 0, false, {
                fileName: "[project]/apps/client/pages/_app.tsx",
                lineNumber: 8,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(Component, {
                ...pageProps
            }, void 0, false, {
                fileName: "[project]/apps/client/pages/_app.tsx",
                lineNumber: 9,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0-mhv-g._.js.map