import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import {
  Card,
  Table,
  Select,
  Input,
  Button,
  message,
  Tag,
  Form,
  Row,
  Col,
  Pagination,
  Tooltip,
} from "antd";
import {
  EyeOutlined,
  DeleteOutlined,
  SearchOutlined,
  PlusCircleOutlined,
  EditOutlined,
  UserAddOutlined,
  LeftCircleOutlined,
  ClearOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
// import utils from "utils";
import RegistrationService from "services/RegistrationService";
import { getDateDayString, getDateString } from "utils/aditionalFunctions";
import ProviderComponent from "providerComponent";
import { Modal } from "antd";
import { useTranslation } from "react-i18next";
import RaportService from "services/RaportService";
import { MODEL_TYPES, SESSION_TYPES } from "utils/sessions";
import RelativeService from "services/RelativeService";

const RegisterList = () => {
  const [searchParams] = useSearchParams();
  const searchParamsData = searchParams.get("search");
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [list, setList] = useState([]);
  const [selectedRows, setSelectedRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageNumber, setPageNumber] = useState(
    parseInt(searchParams.get("pageNumber")) || 1
  );
  const [pageSize, setPageSize] = useState(
    parseInt(searchParams.get("pageSize")) || 10
  );
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(
    searchParamsData ? JSON.parse(searchParamsData) : {}
  );
  // expand control removed; UI button is commented out
  const [expand] = useState(false);
  const [form] = Form.useForm();

  const [modalDeleteVisible, setModalDeleteVisible] = useState(false);
  const [deleteRowId, setDeleteRowId] = useState(null);
  const [sortedColumns, setSortedColumns] = useState([]);

  // Configuration for tab navigation - set to -1 to skip fields
  const tabNavigationConfig = {
    regNumber: 1,
    lastName: 2,
    firstName: 3,
    fatherName: 4,
    birthPlace: 5,
    // To skip a field during tab navigation, set its value to -1
    // Example: someField: -1, // This field will be skipped
    // To reorder fields, change the numbers (lower numbers come first)

    // EXAMPLE: To skip the birthPlace field, uncomment the line below:
    // birthPlace: -1, // This will skip birthPlace during tab navigation
  };

  // Utility function to get tabindex for a field
  const getTabIndex = (fieldName) => {
    return tabNavigationConfig[fieldName] || -1;
  };

  const fields = [
    "regNumber",
    "lastName",
    "firstName",
    "fatherName",
    "form",
    "birthDate",
    "birthPlace",
    "workPlace",
  ];

  const updateSearchParams = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.set("pageNumber", pageNumber.toString());
    params.set("pageSize", pageSize.toString());
    params.set("search", JSON.stringify(search));
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  }, [
    location.search,
    location.pathname,
    navigate,
    pageNumber,
    pageSize,
    search,
  ]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const sortParam = sortedColumns.length > 0
        ? { sort: sortedColumns.map(s => ({ [s.field]: s.order.toLowerCase() })) }
        : undefined;
      const res = await RegistrationService.getList(
        pageNumber,
        pageSize,
        search?.model || "",
        search,
        sortParam
      );
      if (res?.data?.registrations?.length > 0) {
        setList(res?.data?.registrations);
        setTotal(res?.data?.total_registrations);
      } else {
        setList([]);
        setTotal(0);
        message.error("Ma'lumotlar topilmadi");
      }
    } catch (error) {
      console.log("error", error);
      setList([]);
      setTotal(0);
      message.error("Ma'lumotlar topilmadi");
    } finally {
      setLoading(false);
    }
  }, [pageNumber, pageSize, search, sortedColumns]);

  useEffect(() => {
    updateSearchParams();
    fetchData();
  }, [updateSearchParams, fetchData]);

  const deleteRow = async (data) => {
    if (selectedRows.length > 1) {
      try {
        for (const row of selectedRows) {
          await RegistrationService.delete(row?.id);
        }
        message.success(t("success"));
        fetchData();
      } catch (error) {
        if (error.response.data.code === 434) {
          message.error(t("you_can_only_delete_registration4_type_records"));
        } else {
          message.error(t("error_deleting_data"));
        }
      } finally {
        setSelectedRows([]);
      }
    } else {
      try {
        await RegistrationService.delete(data);
        message.success(t("success"));
        fetchData();
      } catch (error) {
        if (error.response.data.code === 434) {
          message.error(t("you_can_only_delete_registration4_type_records"));
        } else {
          message.error(t("error_deleting_data"));
        }
      }
    }
  };

  const handleDelete = async () => {
    deleteRow(deleteRowId);
    setModalDeleteVisible(false);
  };

  const createSessionFunction = async (id, type, model) => {
    try {
      const response = await RelativeService.addRelativesBySession({
        id: id,
        type: type,
        model: model,
      });
      if (response.status !== 200) throw new Error("Failed to create session");
      message.success(t("session_created"));
    } catch (error) {
      message.error(t("failed_to_create_session"));
    }
  };

  const dropdownMenu = (row, hasDeletePermission) => {
    const baseItems = [
      {
        key: "add-main",
        label: (
          <Flex alignItems="center">
            <PlusCircleOutlined />
            <span className="ml-2">{t("add_main")}</span>
          </Flex>
        ),
        onClick: () => createSessionFunction(row?.id, SESSION_TYPES.SESSION, MODEL_TYPES.RELATIVE),
      },
      {
        key: "add-reserve",
        label: (
          <Flex alignItems="center">
            <PlusCircleOutlined />
            <span className="ml-2">{t("add_reserve")}</span>
          </Flex>
        ),
        onClick: () => createSessionFunction(row?.id, SESSION_TYPES.RESERVE, MODEL_TYPES.RELATIVE),
      },
      {
        key: "add-conclusion",
        label: (
          <Flex alignItems="center">
            <PlusCircleOutlined />
            <span className="ml-2">{t("add_conclusion")}</span>
          </Flex>
        ),
        onClick: () => createSessionFunction(row?.id, SESSION_TYPES.RAPORT, MODEL_TYPES.RELATIVE),
      },
      {
        key: "view-details",
        label: (
          <Flex alignItems="center">
            <EyeOutlined />
            <span className="ml-2">{t("view_details")}</span>
          </Flex>
        ),
        onClick: () => viewDetails(row),
      },
      {
        key: "edit",
        label: (
          <Flex alignItems="center">
            <EditOutlined />
            <span className="ml-2">{t("edit")}</span>
          </Flex>
        ),
        onClick: () => editRegistration(row),
      },
    ];

    // Add relative item conditionally
    if (row?.model === MODEL_TYPES.REGISTRATION) {
      baseItems.push({
        key: "add-relative",
        label: (
          <Flex alignItems="center">
            <UserAddOutlined />
            <span className="ml-2">{t("add_new_relative")}</span>
          </Flex>
        ),
        onClick: () => addRelative(row),
      });
    }

    // Add delete item if user has permission
    if (hasDeletePermission) {
      baseItems.push({
        key: "delete",
        label: (
          <Flex alignItems="center">
            <DeleteOutlined />
            <span className="ml-2">
              {selectedRows.length > 0
                ? `${t("delete")} (${selectedRows.length})`
                : t("delete")}
            </span>
          </Flex>
        ),
        onClick: () => {
          setDeleteRowId(row?.id);
          setModalDeleteVisible(true);
        },
      });
    }

    return {
      items: baseItems,
    };
  };

  const addRegister = (model) => {
    if (model === MODEL_TYPES.REGISTRATION4) {
      navigate(
        `/app/apps/register/add-register?model=${MODEL_TYPES.REGISTRATION4}`
      );
    } else {
      navigate(
        `/app/apps/register/add-register?model=${MODEL_TYPES.REGISTRATION}`
      );
    }
  };

  const editRegistration = (row) => {
    if (row?.model === MODEL_TYPES.REGISTRATION4) {
      navigate(
        `/app/apps/register/edit-register/${row?.id}?model=${MODEL_TYPES.REGISTRATION4}`
      );
    } else {
      navigate(
        `/app/apps/register/edit-register/${row?.id}?model=${MODEL_TYPES.REGISTRATION}`
      );
    }
  };

  const viewDetails = (row) => {
    navigate(`/app/apps/register/info-register/${row?.id}`);
  };

  const addRelative = (row) => {
    navigate(`/app/apps/relative/add-relative/${row?.id}`);
  };

  const dowloadRapport = async (id, conclusionRegNum) => {
    try {
      const res = await RaportService.downloadRapport(id, conclusionRegNum);
      window.open(res?.data?.data?.link, "_blank");
      // await new Promise((resolve) => setTimeout(resolve, 1000));
      // const link = document.createElement("a");
      // link.href = res?.data?.data?.link;
      // link.download = "new-file-name.ext"; // Specify the new file name
      // link.target = "_blank"; // Open in a new tab
      // document.body.appendChild(link);
      // link.click();
      // document.body.removeChild(link);
    } catch (error) {
      message.error(t("failed_to_download_rapport"));
      console.log("error", error);
    }
  };

  const handleTableChange = (pagination, filters, sorter) => {
    const sorters = Array.isArray(sorter) ? sorter : [sorter];
    const newSorted = sorters
      .filter(s => s.order)
      .map(s => ({ field: s.field, order: s.order === 'ascend' ? 'ASC' : 'DESC' }));
    setSortedColumns(newSorted);
  };

  const sortOrderMap = useMemo(() => {
    const map = {};
    sortedColumns.forEach((s) => {
      map[s.field] = s.order === 'ASC' ? 'ascend' : 'descend';
    });
    return map;
  }, [sortedColumns]);

  const tableColumns = [
    {
      title: t("№"),
      dataIndex: "number",
      render: (text, record, index) => (
        <span>{total - ((pageNumber - 1) * pageSize + index)}</span>
      ),
    },
    {
      title: <UnorderedListOutlined />,
      width: "5%",
      dataIndex: "actions",
      render: (_, elm) => (
        <div className="text-right">
          <ProviderComponent rolePermission={["superAdmin", "admin"]}>
            {(hasPermission) => (
              <EllipsisDropdown menu={dropdownMenu(elm, hasPermission)} />
            )}
          </ProviderComponent>
        </div>
      ),
    },
    {
      title: t("reg_number"),
      dataIndex: "regNumber",
      width: "5%",
      sorter: { multiple: 1 },
      sortDirections: ["ascend", "descend"],
      sortOrder: sortOrderMap["regNumber"] || null,
      render: (regNumber) => (
        <Tooltip title={regNumber}>
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {regNumber?.length > 10
              ? "..." + regNumber.slice(regNumber.length - 10)
              : regNumber}
          </span>
        </Tooltip>
      ),
    },
    {
      title: t("form_code"),
      dataIndex: "form_reg",
      sorter: { multiple: 2 },
      sortDirections: ["ascend", "descend"],
      sortOrder: sortOrderMap["form_reg"] || null,
      render: (form_reg) => (
        <Tooltip title={form_reg}>
          <span>
            {form_reg ? (
              form_reg?.length > 10 ? (
                form_reg?.slice(0, 10) + "..."
              ) : (
                form_reg
              )
            ) : (
              <></>
            )}
          </span>
        </Tooltip>
      ),
    },
    {
      title: t("form_reg"),
      dataIndex: "form_reg_log",
      sorter: { multiple: 3 },
      sortDirections: ["ascend", "descend"],
      sortOrder: sortOrderMap["form_reg_log"] || null,
      render: (form_reg_log) => {
        const truncated =
          form_reg_log && form_reg_log.length > 6
            ? "..." + form_reg_log.slice(form_reg_log.length - 6)
            : form_reg_log;

        return (
          <Tooltip title={form_reg_log}>
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {truncated}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: t("register_date"),
      dataIndex: "regDate",
      sorter: { multiple: 4 },
      sortDirections: ["ascend", "descend"],
      sortOrder: sortOrderMap["regDate"] || null,
    },
    {
      title: t("register_end_date"),
      dataIndex: "regEndDate",
      sorter: { multiple: 5 },
      sortDirections: ["ascend", "descend"],
      sortOrder: sortOrderMap["regEndDate"] || null,
    },
    {
      title: t("completion_status"),
      dataIndex: "completeStatus",
      sorter: { multiple: 6 },
      sortDirections: ["ascend", "descend"],
      sortOrder: sortOrderMap["completeStatus"] || null,
      render: (completeStatus, elm) => (
        <>
          {completeStatus === "WAITING" ? (
            new Date(elm?.expiredDate) > new Date() ? (
              <Tag color="green">{t("waiting")}</Tag>
            ) : elm?.accessStatus === "ЗАКЛЮЧЕНИЕ" ? (
              <Tag color="blue">{t("waiting")}</Tag>
            ) : (
              <Tag color="orange">{t("waiting")}</Tag>
            )
          ) : (
            <Tag color="green">{t("completed")}</Tag>
          )}
        </>
      ),
    },
    {
      title: t("access_status"),
      dataIndex: "accessStatus",
      width: "7%",
      sorter: { multiple: 7 },
      sortDirections: ["ascend", "descend"],
      sortOrder: sortOrderMap["accessStatus"] || null,
      render: (accessStatus, elm) => (
        <>
          {(accessStatus === "ДОПУСК" && accessStatus !== null) ||
            accessStatus?.toLowerCase()?.includes("снят") ? (
            <Tooltip title={accessStatus}>
              <Tag
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                color={
                  new Date(elm?.expired) < new Date()
                    ? "orange"
                    : accessStatus === "ДОПУСК" ||
                      accessStatus?.toLowerCase()?.includes("снят")
                      ? "green"
                      : "orange"
                }
              >
                {accessStatus?.length > 10
                  ? accessStatus?.slice(0, 10) + "..."
                  : accessStatus}
              </Tag>
            </Tooltip>
          ) : (
            <>
              {accessStatus === "ЗАКЛЮЧЕНИЕ" ||
                accessStatus === "ЗАКЛЮЧЕНИЕ" ? (
                <Tooltip title={accessStatus}>
                  <Tag color="blue">{accessStatus}</Tag>
                </Tooltip>
              ) : (
                <Tooltip title={accessStatus}>
                  <Tag
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    color="red"
                  >
                    {accessStatus?.length > 10
                      ? accessStatus?.slice(0, 10) + "..."
                      : accessStatus}
                  </Tag>
                </Tooltip>
              )}
            </>
          )}
        </>
      ),
    },
    {
      title: t("expired"),
      dataIndex: "expired",
      width: "5%",
      sorter: { multiple: 8 },
      sortDirections: ["ascend", "descend"],
      sortOrder: sortOrderMap["expired"] || null,
      render: (expired) => (
        <Tooltip title={expired}>
          <span>
            {getDateDayString(expired)?.length > 10
              ? getDateDayString(expired)?.slice(0, 10) + "..."
              : getDateDayString(expired)}
          </span>
        </Tooltip>
      ),
    },
    {
      title: t("conclusion_register_number"),
      dataIndex: "conclusionRegNum",
      sorter: { multiple: 9 },
      sortDirections: ["ascend", "descend"],
      sortOrder: sortOrderMap["conclusionRegNum"] || null,
      render: (conclusionRegNum, elm) => (
        <p onClick={() => dowloadRapport(elm?.id, conclusionRegNum)}>
          {conclusionRegNum}
        </p>
      ),
    },
    {
      title: t("full_name"),
      dataIndex: "fullName",
      width: "15%",
      sorter: { multiple: 10 },
      sortDirections: ["ascend", "descend"],
      sortOrder: sortOrderMap["fullName"] || null,
      render: (full_name) => (
        <Tooltip title={full_name}>
          <span style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          >
            {full_name ? (
              full_name?.length > 50 ? (
                full_name?.slice(0, 50) + "..."
              ) : (
                full_name
              )
            ) : (
              <></>
            )}
          </span>
        </Tooltip>
      ),
    },
    {
      title: t("pinfl"),
      dataIndex: "pinfl",
      width: "5%",
      align: "center",
      sorter: { multiple: 11 },
      sortDirections: ["ascend", "descend"],
      sortOrder: sortOrderMap["pinfl"] || null,
      render: (pinfl) => (
        <Tooltip title={pinfl}>
          <span>
            {pinfl?.length > 10 ? pinfl?.slice(0, 10) + "..." : pinfl}
          </span>
        </Tooltip>
      ),
    },
    {
      title: t("birth_date"),
      dataIndex: "birthDate",
      sorter: { multiple: 12 },
      sortDirections: ["ascend", "descend"],
      sortOrder: sortOrderMap["birthDate"] || null,
      render: (_, elm) => (
        <>
          {elm?.birthDate === null ||
            elm?.birthDate === "Неизвестно" ||
            elm?.birthDate === ""
            ? elm?.birthYear
              ? elm?.birthYear
              : ""
            : getDateDayString(elm?.birthDate) || ""}
        </>
      ),
    },
    {
      title: t("birth_place"),
      dataIndex: "birthPlace",
      sorter: { multiple: 13 },
      sortDirections: ["ascend", "descend"],
      sortOrder: sortOrderMap["birthPlace"] || null,
      render: (birthPlace) => {
        const text = birthPlace || "";
        // If the text is longer than 10 characters, truncate it.
        const truncated = text.length > 10 ? text.slice(0, 10) + "..." : text;

        return (
          <Tooltip title={text}>
            <span
              style={{
                display: "inline-block",
                maxWidth: "200px", // Adjust as needed
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {truncated}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: t("work_place"),
      dataIndex: "workplace",
      sorter: { multiple: 14 },
      sortDirections: ["ascend", "descend"],
      sortOrder: sortOrderMap["workplace"] || null,
      render: (workplace, elm) => {
        const text = `${workplace || ""} ${elm?.positionv1 || ""}`.trim();
        return text.length > 7 ? (
          <Tooltip title={text}>
            <span>{text.slice(0, 7) + "..."}</span>
          </Tooltip>
        ) : (
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "inline-block",
              maxWidth: "200px",
            }}
          >
            {text}
          </span>
        );
      },
    },
    {
      title: t("residence"),
      dataIndex: "residence",
      sorter: { multiple: 15 },
      sortDirections: ["ascend", "descend"],
      sortOrder: sortOrderMap["residence"] || null,
      render: (residence) => (
        <Tooltip title={residence}>
          <span>
            {residence
              ? residence?.length > 10
                ? residence?.slice(0, 10) + "..."
                : residence
              : t("unknown")}
          </span>
        </Tooltip>
      ),
    },
    {
      title: t("initiator"),
      dataIndex: "initiator",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "initiator"),
      render: (initiator, elm) => {
        return (
          <p
            style={{ marginBottom: "0px" }}
          // onClick={() => {
          //   navigate(
          //     `/app/apps/initiator/info-initiator/${elm?.Initiator?.id}?redirect=/app/apps/register/register-list&&search=${search}`
          //   );
          // }}
          >
            {initiator}
          </p>
        );
      },
    },
    {
      title: t("executor"),
      dataIndex: "executor",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "executor"),
    },
    {
      title: t("updated_at"),
      dataIndex: "updatedAt",
      sorter: { multiple: 16 },
      sortDirections: ["ascend", "descend"],
      sortOrder: sortOrderMap["updatedAt"] || null,
      render: (updatedAt) => (
        <>{updatedAt ? getDateString(updatedAt) : t("unknown")}</>
      ),
    },
  ];

  const backHandle = () => {
    navigate(-1);
  };
  const fromatWorkplace = (workplace, position) => {
    if (!workplace) {
      return "Not selected";
    }
    if (!position) {
      return workplace;
    }
    return workplace + " " + position;
  };

  const fromatInitiator = (initiator) => {
    if (!initiator) {
      return t("initiator_not_found");
    }
    return initiator?.first_name + " " + initiator?.last_name;
  };

  const fromatExecutor = (executor) => {
    if (!executor) {
      return t("executor_not_found");
    }
    return executor?.last_name + " " + executor?.first_name;
  };

  return (
    <Card>
      <Modal
        title={t("delete_registration")}
        open={modalDeleteVisible}
        okButtonProps={{
          danger: true,
        }}
        okText={t("delete")}
        cancelText={t("cancel")}
        onOk={handleDelete}
        onCancel={() => setModalDeleteVisible(false)}
      >
        <p>{t("delete_registration_message")}</p>
      </Modal>
      <Flex
        alignItems="center"
        justifyContent="space-between"
        mobileFlex={false}
      >
        <Flex className="mb-1" mobileFlex={false}>
          <div>
            <Select
              className="mb-2"
              placeholder={t("select_option")}
              style={{ width: "250px" }}
              tabIndex={8}
              onChange={(value) => {
                if (value === "All") {
                  setSearch({ ...search, model: "" });
                } else {
                  setSearch({ ...search, model: value });
                }
              }}
              defaultValue={search?.model ? search?.model : "All"}
            >
              <Select.Option value="All">{t("all")}</Select.Option>
              <Select.Option value="registration">
                {t("option_1")}
              </Select.Option>
              <Select.Option value="registration4">
                {t("registration4")}
              </Select.Option>
            </Select>
          </div>
        </Flex>
        <Flex className="mb-1">
          <div className="d-flex gap-2">
            <ProviderComponent rolePermission={["admin", "user", "superAdmin"]}>
              <Button
                onClick={() => addRegister()}
                type="primary"
                icon={<PlusCircleOutlined />}
                tabIndex={9}
                block
              >
                {t("add_new_list")}
              </Button>
            </ProviderComponent>
          </div>
          <div className="md-3">
            <Button className="ml-2" onClick={backHandle} tabIndex={10}>
              <LeftCircleOutlined /> {t("back")}
            </Button>
          </div>
        </Flex>
      </Flex>
      <Form
        form={form}
        name="advanced_search"
        className="ant-advanced-search-form"
        onFinish={() => {}}
      >
        {/* <div style={{ marginBottom: '16px', fontWeight: 'bold' }}>Search system:</div> */}
        <Row gutter={8} style={{ marginBottom: "-10px" }}>
          {expand ? (
            <>
              <Col span={4}>
                <Form.Item name={"field-0"} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    autoFocus
                    tabIndex={getTabIndex('regNumber')}
                    placeholder={t("reg_number")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, [fields[0]]: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={"field-1"} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    tabIndex={getTabIndex('lastName')}
                    placeholder={t("last_name")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, [fields[1]]: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={"field-2"} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    tabIndex={getTabIndex('firstName')}
                    placeholder={t("first_name")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, [fields[2]]: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={"field-3"} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    tabIndex={getTabIndex('fatherName')}
                    placeholder={t("father_name")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, [fields[3]]: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              {/* <Col span={4}>
                <Form.Item name={"field-4"} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("form")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, [fields[4]]: e.target.value })
                    }
                  />
                </Form.Item>
              </Col> */}
              {/* <Col span={4}>
                <Form.Item name={"field-5"} label={null}>
                  <DatePicker.RangePicker
                    picker="year"
                    onChange={(dates) => {
                      if (dates) {
                        setSearch({
                          ...search,
                          birth_year_start: dates[0].year(),
                          birth_year_end: dates[1].year(),
                        });
                      }
                    }}
                    format="YYYY"
                    placeholder={[t("birth_date_start"), t("birth_date_end")]}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </Col> */}
              <Col span={4}>
                <Form.Item name={"field-6"} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    tabIndex={getTabIndex('birthPlace')}
                    placeholder={t("birth_place")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, [fields[6]]: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={"field-7"} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("work_place")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, [fields[7]]: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              {/* <Col span={4}>
                <Form.Item name={`field-8`} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("form_reg")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, form_reg: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={`field-9`} label={null}>
                  <RangePicker
                    onChange={(dates) => {
                      if (dates) {
                        setSearch({
                          ...search,
                          register_date_start: dates[0].format('YYYY-MM-DD'),
                          register_date_end: dates[1].format('YYYY-MM-DD'),
                        });
                      }
                    }}
                    format="YYYY-MM-DD"
                    placeholder={[t("register_date_start"), t("register_date_end")]}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={`field-10`} label={null}>
                  <RangePicker
                    onChange={(dates) => {
                      if (dates) {
                        setSearch({
                          ...search,
                          register_end_date_start: dates[0].format('YYYY-MM-DD'),
                          register_end_date_end: dates[1].format('YYYY-MM-DD'),
                        });
                      }
                    }}
                    format="YYYY-MM-DD"
                    placeholder={[t("register_end_date_start"), t("register_end_date_end")]}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={`field-11`} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("completion_status")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, completion_status: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={`field-12`} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("access_status")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, access_status: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={`field-13`} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("expired")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, expired: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={`field-14`} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("conclusion_register_number")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, conclusion_register_number: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={`field-15`} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("residence")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, residence: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={`field-16`} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("initiator")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, initiator: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={`field-17`} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("executor")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, executor: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={`field-18`} label={null}>
                  <RangePicker
                    onChange={(dates) => {
                      if (dates) {
                        setSearch({
                          ...search,
                          updated_at_start: dates[0].format('YYYY-MM-DD'),
                          updated_at_end: dates[1].format('YYYY-MM-DD'),
                        });
                      }
                    }}
                    format="YYYY-MM-DD"
                    placeholder={[t("updated_at_start"), t("updated_at_end")]}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col> */}
            </>
          ) : (
            <>
              <Col span={4}>
                <Form.Item name={"field-0"} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    autoFocus
                    tabIndex={1}
                    placeholder={t("reg_number")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, [fields[0]]: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={"field-1"} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    tabIndex={getTabIndex('lastName')}
                    placeholder={t("last_name")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, [fields[1]]: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={"field-2"} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    tabIndex={getTabIndex('firstName')}
                    placeholder={t("first_name")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, [fields[2]]: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={"field-3"} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    tabIndex={getTabIndex('fatherName')}
                    placeholder={t("father_name")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, [fields[3]]: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={"field-6"} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    tabIndex={getTabIndex('birthPlace')}
                    placeholder={t("birth_place")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, [fields[6]]: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              {/* <Col span={4}>
                <Form.Item name={"field-4"} label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("form")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, [fields[4]]: e.target.value })
                    }
                  />
                </Form.Item>
              </Col> */}
              {/* <Col span={4}>
                <Form.Item name={"field-5"} label={null}>
                  <DatePicker.RangePicker
                    picker="year"
                    onChange={(dates) => {
                      if (dates) {
                        setSearch({
                          ...search,
                          birth_year_start: dates[0].year(),
                          birth_year_end: dates[1].year(),
                        });
                      }
                    }}
                    format="YYYY"
                    placeholder={[t("birth_date_start"), t("birth_date_end")]}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </Col> */}
            </>
          )}
        </Row>
        <Row style={{ marginBottom: "10px" }}>
          <Col span={24} style={{ textAlign: "right" }}>
            {/* <Button
              type="primary"
              onClick={() => {
                searchForm();
              }}
            >
              <SearchOutlined /> {t("search")}
            </Button> */}
            <Button
              style={{ marginLeft: 8 }}
              tabIndex={6}
              onClick={() => {
                setSearch({
                  model: search?.model ? search?.model : "registration",
                });
                form.resetFields();
                setSortedColumns([]);
              }}
            >
              <ClearOutlined /> {t("clear")}
            </Button>
            {/* <Button
              style={{ marginLeft: 8, fontSize: 12 }}
              onClick={() => setExpand(!expand)}
            >
              {expand ? <UpOutlined /> : <DownOutlined />} {t("more_search")}
            </Button> */}
          </Col>
        </Row>
      </Form>
      <div className="table-responsive">
        <Table
          columns={tableColumns}
          dataSource={list.map((elm) => ({
            ...elm,
            birthDate: getDateDayString(elm?.birthDate),
            regDate: getDateDayString(elm?.regDate),
            regEndDate: getDateDayString(elm?.regEndDate),
            workplacef: fromatWorkplace(elm?.workplace, elm?.position),
            initiator: fromatInitiator(elm?.Initiator),
            executor: fromatExecutor(elm?.executor),
          }))}
          rowKey="id"
          // rowSelection={{
          //   selectedRowKeys: selectedRowKeys,
          //   type: "checkbox",
          //   preserveSelectedRowKeys: false,
          //   ...rowSelection,
          // }}
          loading={loading}
          pagination={false}
          onChange={handleTableChange}
        />
        <Row
          style={{
            marginTop: 16,
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Col>
            <span style={{ fontWeight: "bold" }}>
              {t("total_number_of_entries")}: {total}
            </span>
          </Col>
          <Col>
            <Pagination
              current={pageNumber}
              pageSize={pageSize}
              total={total}
              showSizeChanger
              pageSizeOptions={["10", "20", "50"]}
              onShowSizeChange={(current, size) => {
                setPageSize(size);
                setPageNumber(1);
              }}
              onChange={(page, pageSize) => {
                setPageNumber(page);
              }}
            />
          </Col>
        </Row>
      </div>
    </Card>
  );
};

export default RegisterList;
