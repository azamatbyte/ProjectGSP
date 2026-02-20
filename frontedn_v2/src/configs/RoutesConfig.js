import React from "react";
import { AUTH_PREFIX_PATH, APP_PREFIX_PATH } from "configs/AppConfig";

export const publicRoutes = [
    {
        key: "login",
        role: ["all"],
        path: `${AUTH_PREFIX_PATH}/login`,
        component: React.lazy(() => import("views/auth-views/authentication/login")),
    },
    {
        key: "forgot-password",
        role: ["all"],
        path: `${AUTH_PREFIX_PATH}/forgot-password`,
        component: React.lazy(() => import("views/auth-views/authentication/forgot-password")),
    },
    {
        key: "error-page-1",
        role: ["all"],
        path: `${AUTH_PREFIX_PATH}/error-page-1`,
        component: React.lazy(() => import("views/auth-views/errors/error-page-1")),
    },
    {
        key: "error-page-2",
        role: ["all"],
        path: `${AUTH_PREFIX_PATH}/error-page-2`,
        component: React.lazy(() => import("views/auth-views/errors/error-page-2")),
    },
];

export const protectedRoutes = [
    {
        key: "dashboard.default",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/default`,
        component: React.lazy(() => import("views/app-views/dashboards/default")),
    },
    {
        key: "apps",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps`,
        component: React.lazy(() => import("views/app-views/apps")),
    },
    {
        key: "apps.admin.add-admin",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/admin/add-admin`,
        component: React.lazy(() => import("views/app-views/apps/admin/add-admin")),
    },
    {
        key: "apps.admin.edit-admin",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/admin/edit-admin/:id`,
        component: React.lazy(() => import("views/app-views/apps/admin/edit-admin")),
    },
    {
        key: "apps.admin.info-admin",
        role: ["superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/admin/info-admin/:id`,
        component: React.lazy(() => import("views/app-views/apps/admin/info-admin")),
    },
    {
        key: "apps.admin.admin-list",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/admin-list`,
        component: React.lazy(() => import("views/app-views/apps/admin/admin-list")),
    },

    {
        key: "apps.admin.admin-log-info",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/admin/admin-log-info/:id`,
        component: React.lazy(() => import("views/app-views/apps/admin/admin-log-info")),
    },

    // =======
    {
        key: "apps.initiator.add-initiator",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/initiator/add-initiator`,
        component: React.lazy(() => import("views/app-views/apps/initiator/add-initiator")),
    },
    {
        key: "apps.initiator.edit-initiator",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/initiator/edit-initiator/:id`,
        component: React.lazy(() => import("views/app-views/apps/initiator/edit-initiator")),
    },
    {
        key: "apps.initiator.info-initiator",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/initiator/info-initiator/:id`,
        component: React.lazy(() => import("views/app-views/apps/initiator/info-initiator")),
    },
    {
        key: "apps.initiator.initiator-list",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/initiator-list`,
        component: React.lazy(() => import("views/app-views/apps/initiator/initiator-list")),
    },
    {
        key: "apps.initiator.initiator-log-info",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/initiator/initiator-log-info/:id`,
        component: React.lazy(() => import("views/app-views/apps/initiator/initiator-log-info")),
    },
    // ======
    {
        key: "apps.relative.add-relative",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/relative/add-relative/:id`,
        component: React.lazy(() => import("views/app-views/apps/relative/add-relative")),
    },
    {
        key: "apps.relative.edit-relative",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/relative/edit-relative/:id`,
        component: React.lazy(() => import("views/app-views/apps/relative/edit-relative")),
    },
    {
        key: "apps.relative.info-relative",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/relative/info-relative/:id`,
        component: React.lazy(() => import("views/app-views/apps/relative/info-relative")),
    },
    {
        key: "apps.relative.relative-list",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/relative-list`,
        component: React.lazy(() => import("views/app-views/apps/relative/relative-list")),
    },
    {
        key: "apps.register",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/register-list`,
        component: React.lazy(() => import("views/app-views/apps/register/register-list")),
    },
    {
        key: "apps.register.add-register",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/register/add-register`,
        component: React.lazy(() => import("views/app-views/apps/register/add-register")),
    },
    {
        key: "apps.register.edit-register",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/register/edit-register/:id`,
        component: React.lazy(() => import("views/app-views/apps/register/edit-register")),
    },
    {
        key: "apps.register.info-register",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/register/info-register/:id`,
        component: React.lazy(() => import("views/app-views/apps/register/info-register")),
    },

    {
        key: "apps.register.register-log-info",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/register/register-log-info/:id`,
        component: React.lazy(() => import("views/app-views/apps/register/register-log-info")),
    },
    // =====
    {
        key: "apps.registration_four.registrationFour-list",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/registrationFour-list`,
        component: React.lazy(() => import("views/app-views/apps/registration_four/registrationFour-list")),
    },

    // ====
    {
        key: "apps.workplace",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/work-list`,
        component: React.lazy(() => import("views/app-views/apps/workplace/work-list")),
    },
    {
        key: "apps.workplace.add-work",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/workplace/add-work`,
        component: React.lazy(() => import("views/app-views/apps/workplace/add-work")),
    },
    {
        key: "apps.workplace.edit-work",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/workplace/edit-work/:id`,
        component: React.lazy(() => import("views/app-views/apps/workplace/edit-work")),
    },
    {
        key: "apps.workplace.info-work",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/workplace/info-work/:id`,
        component: React.lazy(() => import("views/app-views/apps/workplace/info-work")),
    },
    {
        key: "apps.workplace.work-log-info",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/workplace/work-log-info/:id`,
        component: React.lazy(() => import("views/app-views/apps/workplace/work-log-info")),
    },
    // =====
    {
        key: "apps.relation",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/relation-list`,
        component: React.lazy(() => import("views/app-views/apps/relation/relation-list")),
    },
    {
        key: "apps.relation.add-relation",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/relation/add-relation`,
        component: React.lazy(() => import("views/app-views/apps/relation/add-relation")),
    },
    {
        key: "apps.relation.edit-relation",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/relation/edit-relation/:id`,
        component: React.lazy(() => import("views/app-views/apps/relation/edit-relation")),
    },
    {
        key: "apps.relation.info-relation",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/relation/info-relation/:id`,
        component: React.lazy(() => import("views/app-views/apps/relation/info-relation")),
    },

    {
        key: "apps.relation.relation-log-info",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/relation/relation-log-info/:id`,
        component: React.lazy(() => import("views/app-views/apps/relation/relation-log-info")),
    },

    // =====
    {
        key: "apps.service",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/service-list`,
        component: React.lazy(() => import("views/app-views/apps/service/service-list")),
    },

    // ======

    {
        key: "apps.form",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/form-list`,
        component: React.lazy(() => import("views/app-views/apps/form/form-list")),
    },
    {
        key: "apps.form.add-form",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/form/add-form`,
        component: React.lazy(() => import("views/app-views/apps/form/add-form")),
    },
    {
        key: "apps.form.edit-form",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/form/edit-form/:id`,
        component: React.lazy(() => import("views/app-views/apps/form/edit-form")),
    },

    // =======
    {
        key: "apps.status",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/status-list`,
        component: React.lazy(() => import("views/app-views/apps/status/status-list")),
    },
    {
        key: "apps.status.add-status",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/status/add-status`,
        component: React.lazy(() => import("views/app-views/apps/status/add-status")),
    },
    {
        key: "apps.status.edit-status",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/status/edit-status/:id`,
        component: React.lazy(() => import("views/app-views/apps/status/edit-status")),
    },
    {
        key: "apps.status.info-status",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/status/info-status/:id`,
        component: React.lazy(() => import("views/app-views/apps/status/info-status")),
    },
    {
        key: "apps.status.status-log-info",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/status/status-log-info/:id`,
        component: React.lazy(() => import("views/app-views/apps/status/status-log-info")),
    },

    // =====
    {
        key: "apps.search",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/search-list`,
        component: React.lazy(() => import("views/app-views/apps/search/search-list")),
    },
    {
        key: "apps.cart",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/cart-list`,
        component: React.lazy(() => import("views/app-views/apps/cart_store/cart-list")),
    },
    {
        key: "apps.reserve",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/reserve-list`,
        component: React.lazy(() => import("views/app-views/apps/reserve_store/reserve-list")),
    },
    {
        key: "apps.conclusion",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/conclusion`,
        component: React.lazy(() => import("views/app-views/apps/reserve_store/conclusion-list")),
    },
    {
        key: "apps.conclusion",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/conclusion-list`,
        component: React.lazy(() => import("views/app-views/apps/conclusion/conclusion-list")),
    },
    {
        key: "apps.conclusion.add-conclusion",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/conclusion/add-conclusion`,
        component: React.lazy(() => import("views/app-views/apps/conclusion/add-conclusion")),
    },
    {
        key: "apps.conclusion.edit-conclusion",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/conclusion/edit-conclusion/:id`,
        component: React.lazy(() => import("views/app-views/apps/conclusion/edit-conclusion")),
    },
    {
        key: "apps.raport",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/raport-list`,
        component: React.lazy(() => import("views/app-views/apps/raports/raport-list")),
    },
    {
        key: "apps.raport.edit-raport",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/raports/edit-raport/:id`,
        component: React.lazy(() => import("views/app-views/apps/raports/edit-raport")),
    },
    {
        key: "apps.raport-types",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/raport-types`,
        component: React.lazy(() => import("views/app-views/apps/raport_types/raport-list")),
    },
    {
        key: "apps.raport-types.add-raport-type",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/raport-types/add-raport-type`,
        component: React.lazy(() => import("views/app-views/apps/raport_types/addRaport")),
    },
    {
        key: "apps.raport-types.info-raport",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/raport_types/info-raport/:id`,
        component: React.lazy(() => import("views/app-views/apps/raport_types/info-raport")),
    },
    {
        key: "apps.raport-types.edit-raport",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/raport-types/edit-raport/:id`,
        component: React.lazy(() => import("views/app-views/apps/raport_types/editRaport")),
    },

    // =====
    {
        key: "apps.registration_four.edit-register-four",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/registration_four/edit-register-four/:id`,
        component: React.lazy(() => import("views/app-views/apps/registration_four/edit-register-four")),
    },
    {
        key: "apps.registration_four.find-match",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/registration_four/find-match/:id`,
        component: React.lazy(() => import("views/app-views/apps/registration_four/find-match")),
    },
    // ========
    {
        key: "apps.signed-list.add-signed",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/signed-list/add-signed`,
        component: React.lazy(() => import("views/app-views/apps/signed_list/add-signed")),
    },
    {
        key: "apps.signed-list.edit-signed",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/signed-list/edit-signed/:id`,
        component: React.lazy(() => import("views/app-views/apps/signed_list/edit-signed")),
    },
    {
        key: "apps.signed-list.info-signed",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/signed-list/info-signed/:id`,
        component: React.lazy(() => import("views/app-views/apps/signed_list/info-signed")),
    },
    {
        key: "apps.signed-list.signed-list",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/signed-list`,
        component: React.lazy(() => import("views/app-views/apps/signed_list/signed-list")),
    },

    {
        key: "apps.signed-list.signed-log-info",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/apps/signed-list/signed-log-info/:id`,
        component: React.lazy(() => import("views/app-views/apps/signed_list/signed-log-info")),
    },

    // =====
    {
        key: "apps.statistic",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/statistic-list`,
        component: React.lazy(() => import("views/app-views/apps/statistics/statistic-list")),
    },

    // =====
    {
        key: "apps.statistic.report-by-departments",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/report-by-departments`,
        component: React.lazy(() => import("views/app-views/apps/statistics/StatisticForms/report_by_departments")),
    },
    {
        key: "apps.statistic.report-by-form",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/report-by-form`,
        component: React.lazy(() => import("views/app-views/apps/statistics/StatisticForms/report_by_form")),
    },
    {
        key: "apps.statistic.report-on-SP-forms",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/report-on-SP-Forms`,
        component: React.lazy(() => import("views/app-views/apps/statistics/StatisticForms/report_on_SP_forms")),
    },

    {
        key: "apps.statistic.monitoring-work-operators",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/monitoring-work-operators`,
        component: React.lazy(() => import("views/app-views/apps/statistics/StatisticForms/monitoring_work_operators")),
    },

    {
        key: "apps.statistic.statistics-by-year",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/statistics-by-year`,
        component: React.lazy(() => import("views/app-views/apps/statistics/StatisticForms/statistics_by_year")),
    },
    {
        key: "apps.weekly-analysis",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/weekly-analysis`,
        component: React.lazy(() => import("views/app-views/apps/weekly_analysis/WeeklyAnalysisForm/monitoring_work_operators")),
    },
    {
        key: "apps.weekly-analysis-operator",
        role: ["admin", "superAdmin"],
        path: `${APP_PREFIX_PATH}/weekly-analysis-operator`,
        component: React.lazy(() => import("views/app-views/apps/statistics/StatisticForms/weekly_analysis_operator")),
    },
];
