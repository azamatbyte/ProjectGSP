import {
  DashboardOutlined,
  UnorderedListOutlined,
  AuditOutlined,
  UserOutlined,
  UserSwitchOutlined,
  BankOutlined,
  LineChartOutlined,
  UsergroupAddOutlined,
  SettingOutlined,
  FormOutlined,
  ControlOutlined,
  FileSearchOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import { APP_PREFIX_PATH } from "configs/AppConfig";

const extraNavTree = [
  {
    key: "apps-register",
    path: `${APP_PREFIX_PATH}/apps/register`,
    title: "sidenav.dashboard.registration",
    icon: AuditOutlined,
    breadcrumb: true,
    isGroupTitle: true,
    submenu: [],
    role: ["admin", "superAdmin"],
  },
  {
    key: "apps-relative-FileSearchOutlinedList",
    path: `${APP_PREFIX_PATH}/search-list`,
    title: "sidenav.dashboard.search",
    icon: FileSearchOutlined,
    breadcrumb: true,
    submenu: [],
    role: ["admin", "superAdmin"],
  },
  {
    key: "apps-register-registerList",
    path: `${APP_PREFIX_PATH}/register-list`,
    title: "sidenav.dashboard.registration2",
    icon: UnorderedListOutlined,
    breadcrumb: true,
    submenu: [],
    role: ["admin", "superAdmin"],
  },
  {
    key: "apps-relative-relativeList",
    path: `${APP_PREFIX_PATH}/relative-list`,
    title: "sidenav.dashboard.relative",
    icon: UsergroupAddOutlined,
    breadcrumb: true,
    submenu: [],
    role: ["admin", "superAdmin"],
  },
  {
    key: "apps-registrationFour-registrationFourList",
    path: `${APP_PREFIX_PATH}/registrationFour-list`,
    title: "sidenav.dashboard.registrationFour",
    icon: UsergroupAddOutlined,
    breadcrumb: true,
    submenu: [],
    role: ["admin", "superAdmin"],
  },

  // {
  //   key: "apps-raport-raportList",
  //   path: `${APP_PREFIX_PATH}/raport-list`,
  //   title: "sidenav.dashboard.raport",
  //   icon: FileExcelOutlined,
  //   breadcrumb: true,
  //   submenu: [],
  // },
  // {
  //   key: 'apps-cart-cartList',
  //   path: `${APP_PREFIX_PATH}/cart-list`,
  //   title: 'sidenav.dashboard.cart',
  //   icon: ShoppingCartOutlined,
  //   breadcrumb: true,
  //   submenu: [],
  //   role: ["admin", "superAdmin"],
  // },
  {
    key: "apps-conclusion",
    path: `${APP_PREFIX_PATH}/conclusion`,
    title: "conclusion",
    breadcrumb: true,
    submenu: [],
    role: ["admin", "superAdmin"],
    hidden: true
  },
  {
    key: "apps-cart-list",
    path: `${APP_PREFIX_PATH}/cart-list`,
    title: "main",
    breadcrumb: true,
    submenu: [],
    role: ["admin", "superAdmin"],
    hidden: true
  },
  {
    key: "apps-reserve-list",
    path: `${APP_PREFIX_PATH}/reserve-list`,
    title: "reserve",
    breadcrumb: true,
    submenu: [],
    role: ["admin", "superAdmin"],
    hidden: true
  },
  // {
  //   key: 'apps-register-addRegister',
  //   path: `${APP_PREFIX_PATH}/apps/register/add-register`,
  //   title: 'Add Registration',
  //   icon: UserAddOutlined,
  //   breadcrumb: false,
  //   submenu: []
  // },
  // {
  //   key: 'apps-register-editRegister',
  //   path: `${APP_PREFIX_PATH}/apps/register/edit-register/12`,
  //   title: 'Edit Registration',
  //   icon: EditOutlined,
  //   breadcrumb: false,
  //   submenu: []
  // }
];

const dashBoardNavTree = [
  {
    key: "dashboards",
    path: `${APP_PREFIX_PATH}/dashboards`,
    icon: DashboardOutlined,
    breadcrumb: true,
    isGroupTitle: true,
    role: ["admin", "superAdmin"],
    submenu: [
      {
        key: "dashboards-default",
        path: `${APP_PREFIX_PATH}/dashboards/default`,
        title: "sidenav.dashboard",
        icon: DashboardOutlined,
        breadcrumb: true,
        role: ["admin", "superAdmin"],
        submenu: [
          {
            key: "apps-admin-adminList",
            path: `${APP_PREFIX_PATH}/admin-list`,
            title: "sidenav.dashboard.admin",
            icon: UserOutlined,
            breadcrumb: true,
            submenu: [],
            role: ["superAdmin"],
          },
          {
            key: "apps-signed-signedList",
            path: `${APP_PREFIX_PATH}/signed-list`,
            title: "sidenav.dashboard.signed",
            icon: UsergroupAddOutlined,
            breadcrumb: true,
            submenu: [],
            role: ["admin", "superAdmin"],
          },
          {
            key: "apps-initiator-initiatorList",
            path: `${APP_PREFIX_PATH}/initiator-list`,
            title: "sidenav.dashboard.initiator",
            icon: UsergroupAddOutlined,
            breadcrumb: true,
            submenu: [],
            role: ["superAdmin"],
          },
          {
            key: "apps-raport-raportList",
            path: `${APP_PREFIX_PATH}/raport-list`,
            title: "sidenav.dashboard.raport",
            icon: FileExcelOutlined,
            breadcrumb: true,
            submenu: [],
            role: ["admin", "superAdmin"],
          },
          {
            key: "apps-raport-raportTypesList",
            path: `${APP_PREFIX_PATH}/raport-types`,
            title: "sidenav.dashboard.raportTypes",
            icon: FilePdfOutlined,
            breadcrumb: true,
            submenu: [],
            role: ["superAdmin"],
          },
          {
            key: "apps-admin-workList",
            path: `${APP_PREFIX_PATH}/work-list`,
            title: "sidenav.dashboard.work",
            icon: BankOutlined,
            breadcrumb: true,
            submenu: [],
            role: ["admin", "superAdmin"],
          },
          {
            key: "apps-relation-relationList",
            path: `${APP_PREFIX_PATH}/relation-list`,
            title: "sidenav.dashboard.relation",
            icon: UserSwitchOutlined,
            breadcrumb: true,
            submenu: [],
            role: ["superAdmin"],
          },
          {
            key: "apps-form-formList",
            path: `${APP_PREFIX_PATH}/form-list`,
            title: "sidenav.dashboard.form",
            icon: FormOutlined,
            breadcrumb: true,
            submenu: [],
            role: ["superAdmin"],
          },
          {
            key: "apps-conclusion-conclusionList",
            path: `${APP_PREFIX_PATH}/conclusion-list`,
            title: "conclusion",
            icon: FilePdfOutlined,
            breadcrumb: true,
            submenu: [],
            role: ["superAdmin"],
          },
          {
            key: "apps-status-statusList",
            path: `${APP_PREFIX_PATH}/status-list`,
            title: "sidenav.dashboard.status",
            icon: ControlOutlined,
            breadcrumb: true,
            submenu: [],
            role: ["superAdmin"],
          },
          {
            key: "apps-service-serviceList",
            path: `${APP_PREFIX_PATH}/service-list`,
            title: "sidenav.dashboard.service",
            icon: SettingOutlined,
            breadcrumb: true,
            submenu: [],
            role: ["superAdmin"],
          },
          {
            key: "apps-statistic-statisticList",
            path: `${APP_PREFIX_PATH}/statistic-list`,
            title: "sidenav.dashboard.statistic",
            icon: LineChartOutlined,
            breadcrumb: true,
            submenu: [],
            role: ["admin", "superAdmin"],
          },
          {
            key: "apps-weekly-analysis",
            path: `${APP_PREFIX_PATH}/weekly-analysis`,
            title: "sidenav.dashboard.weeklyAnalysis",
            icon: CalendarOutlined,
            breadcrumb: true,
            submenu: [],
            role: ["admin", "superAdmin"],
          },
          // {
          //   key: "dashboards",
          //   path: `${APP_PREFIX_PATH}/default`,
          //   title: "sidenav.dashboard.statistc",
          //   icon: LineChartOutlined,
          //   breadcrumb: true,
          //   submenu: [],
          // },
        ],
      },
    ],
  },
];

// const appsNavTree = [{
//   key: 'apps',
//   path: `${APP_PREFIX_PATH}/apps`,
//   icon: AppstoreOutlined,
//   breadcrumb: false,
//   isGroupTitle: true,
//   submenu: [
//     {
//       key: 'apps-admin',
//       path: `${APP_PREFIX_PATH}/apps/admin`,
//       title: 'Admin',
//       icon: HomeOutlined,
//       breadcrumb: true,
//       submenu: [
//         {
//           key: 'apps-admin-adminList',
//           path: `${APP_PREFIX_PATH}/apps/admin/admin-list`,
//           title: 'Admin List',
//           icon: UnorderedListOutlined,
//           breadcrumb: true,
//           submenu: []
//         },
//         {
//           key: 'apps-admin-addAdmin',
//           path: `${APP_PREFIX_PATH}/apps/admin/add-admin`,
//           title: 'Add Admin',
//           icon: UserAddOutlined,
//           breadcrumb: false,
//           submenu: []
//         },
//         {
//           key: 'apps-admin-editAdmin',
//           path: `${APP_PREFIX_PATH}/apps/admin/edit-admin/12`,
//           title: 'Edit Admin',
//           icon: EditOutlined,
//           breadcrumb: false,
//           submenu: []
//         }
//       ]
//     }
//   ]
// }]

// const workplaceNavTree = [{
//   key: 'apps',
//   path: `${APP_PREFIX_PATH}/apps`,
//   icon: IdcardOutlined,
//   breadcrumb: false,
//   isGroupTitle: true,
//   submenu: [
//     {
//       key: 'apps-workplace',
//       path: `${APP_PREFIX_PATH}/apps/workplace`,
//       title: 'Workplace',
//       icon: IdcardOutlined,
//       breadcrumb: true,
//       submenu: [
//         {
//           key: 'apps-admin-workList',
//           path: `${APP_PREFIX_PATH}/apps/workplace/work-list`,
//           title: 'Work List',
//           icon: UnorderedListOutlined,
//           breadcrumb: true,
//           submenu: []
//         },
//         {
//           key: 'apps-admin-addWork',
//           path: `${APP_PREFIX_PATH}/apps/workplace/add-work`,
//           title: 'Add Workplace',
//           icon: UserAddOutlined,
//           breadcrumb: false,
//           submenu: []
//         },
//         {
//           key: 'apps-admin-editWork',
//           path: `${APP_PREFIX_PATH}/apps/workplace/edit-work/12`,
//           title: 'Edit Workplace',
//           icon: EditOutlined,
//           breadcrumb: false,
//           submenu: []
//         }
//       ]
//     }
//   ]
// }]

// const relationNavTree = [{
//   key: 'apps',
//   path: `${APP_PREFIX_PATH}/apps`,
//   icon: TeamOutlined,
//   breadcrumb: false,
//   isGroupTitle: true,
//   submenu: [
//     {
//       key: 'apps-relation',
//       path: `${APP_PREFIX_PATH}/apps/relation`,
//       title: 'Relation',
//       icon: TeamOutlined,
//       breadcrumb: true,
//       submenu: [
//         {
//           key: 'apps-relation-relationList',
//           path: `${APP_PREFIX_PATH}/apps/relation/relation-list`,
//           title: 'Relation List',
//           icon: UnorderedListOutlined,
//           breadcrumb: true,
//           submenu: []
//         },
//         {
//           key: 'apps-relation-addRelation',
//           path: `${APP_PREFIX_PATH}/apps/relation/add-relation`,
//           title: 'Add Relation',
//           icon: UserAddOutlined,
//           breadcrumb: false,
//           submenu: []
//         },
//         {
//           key: 'apps-relation-editRelation',
//           path: `${APP_PREFIX_PATH}/apps/relation/edit-relation/12`,
//           title: 'Edit Relation',
//           icon: EditOutlined,
//           breadcrumb: false,
//           submenu: []
//         }
//       ]
//     }
//   ]
// }]

const navigationConfig = [...dashBoardNavTree, ...extraNavTree];

export default navigationConfig;
