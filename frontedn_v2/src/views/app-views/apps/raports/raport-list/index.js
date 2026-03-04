import React, { useCallback, useEffect, useState } from "react";
import {
  Card,
  Table,
  Select,
  Switch,
  Button,
  message,
  Row,
  Col,
  Pagination,
  Input,
  Modal,
  Upload,
  Form,
  Tooltip
} from "antd";
import {
  PlusCircleOutlined,
  EditOutlined,
  LeftCircleOutlined,
  DownloadOutlined,
  UploadOutlined,
  UnorderedListOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import { useNavigate } from "react-router-dom";
// ...existing code...
import { getDateDayString, getDateString } from "utils/aditionalFunctions";
import ProviderComponent from "providerComponent";
import { useTranslation } from "react-i18next";
import RaportService from "services/RaportService";
import { RaportStatus } from "constants/RaportStatus";
import { categoriesOfRaports } from "utils/sessions";
import debounce from "lodash/debounce";
import AuthService from "services/AuthService";
import { handleUpload } from "../../admin/AdminForm/GeneralField";

const fetchExecutor = async (searchText) => {
  try {
    const response = await AuthService.getList(1, 5, searchText);
    console.log("response", response);
    return response?.data?.users?.map((item) => ({
      label: item?.first_name + " " + item?.last_name,
      id: item?.id,
    }));
  } catch (error) {
    console.error("Xatolik:", error);
    return [];
  }
};

const RaportList = (props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [executorFetching, setExecutorFetching] = useState(false);
  const [executorOptions, setExecutorOptions] = useState([]);
  const { setUploadedFile, setRaportId } = props;
  const [search, setSearch] = useState({ adminCheck: "all", operator: "all", discuss: "all", fullName: "", name: "", executor: "", registration4: "", });

  // 🔹 Modal holati uchun
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRaport, setSelectedRaport] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [uploadFileList, setUploadFileList] = useState([]);
  const [form] = Form.useForm();
  const { Dragger } = Upload;


  // ✅ Upload props
  const uploadProps = {
    name: "file",
    multiple: false,
    showUploadList: true,
    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        const res = await handleUpload(file);
        if (res?.data?.link) {
          message.success(t("file_uploaded_successfully"));
          onSuccess(res, file);
          setFileList([{
            uid: file.uid,
            name: file.name,
            status: 'done',
            link: res.data.link,
            originFileObj: file
          }]);
        } else {
          onError(new Error("Upload failed"));
        }
      } catch (err) {
        console.error(err);
        onError(err);
      }
    },
  };

  // 🔹 Modal ochish
  const openUploadModal = (elm) => {
    setSelectedRaport(elm);
    setIsModalOpen(true);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
    setFileList([]);
  };

  // ✅ Faylni yuborish
  const handleUploadSubmit = async () => {
    if (!fileList.length) {
      message.warning(t("please_upload_file"));
      return;
    }

    try {
      setLoading(true);
      const fileData = fileList[0];
      const link = fileData.link || null;

      if (!link) {
        message.error(t("file_not_uploaded"));
        return;
      }

      const values = {
        id: selectedRaport?.raportId,
        link,
      };

      const res = await RaportService.update(values);
      if (res.status === 200) {
        message.success(t("raport_successfully_updated"));
        // Status remains manual; refresh list for latest data
        fetchData();
        handleCancel();
      } else {
        message.error(t("upload_failed"));
      }
    } catch (err) {
      console.error(err);
      message.error(t("error_during_upload"));
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    const fetchData = async () => {
      const executors = await fetchExecutor("");
      setExecutorOptions(
        executors.map((item) => ({
          value: item?.id,
          label: item?.label,
          id: item?.id,
        }))
      );
    };
    fetchData();
  }, []);


  const debouncedFetchExecutor = debounce(async (searchText) => {
    if (searchText.length >= 1) {
      setExecutorFetching(true);
      const executors = await fetchExecutor(searchText);
      setExecutorOptions(
        executors.map((item) => ({
          value: item?.id,
          label: item?.label,
          id: item?.id,
        }))
      );
      setExecutorFetching(false);
    }
  }, 500);


  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await RaportService.listExecutor(
        pageNumber,
        pageSize,
        "",
        "",
        search,
      );
      // console.log("res?.data?.raports", res?.data?.raports);
      setList(res?.data?.raports);
      // console.log("raports", res?.data?.raports[0]?.registrations?.length);
      setTotal(res?.data?.total_raports);
    } catch (error) {
      // console.log("error", error);
      setList([]);
      setTotal(0);
      message.error(t("data_not_found"));
    } finally {
      setLoading(false);
    }
  }, [pageNumber, pageSize, search, t]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dropdownMenu = (row, hasEditPermission) => {
    const items = [];

    // Add edit item if user has permission
    if (hasEditPermission) {
      items.push({
        key: "edit",
        label: (
          <Flex alignItems="center">
            <EditOutlined />
            <span className="ml-2">{t("edit")}</span>
          </Flex>
        ),
        onClick: () => editRegistration(row)
      });
    }

    return { items };
  };

  const goToSearch = () => {
    navigate("/app/search-list");
  };

  const editRegistration = (row) => {
    navigate(`/app/raports/edit-raport/${row.id}?redirect=/app/raport-list`);
  };

  const backHandle = () => {
    navigate(-1);
  };

  const download = (link, filename, elm) => {
    const a = document.createElement("a");
    let regNumber = "";
    if (Array.isArray(elm?.registrations) && elm.registrations.length > 0) {
      regNumber = elm.registrations.length > 1
        ? elm.registrations.map((r) => r?.regNumber).filter(Boolean).join("_")
        : (elm?.registrations?.[0]?.regNumber || "");
    } else {
      regNumber = elm?.registration?.regNumber || "";
    }
    console.log("regNumber", regNumber);
    if (raportStatusMap[filename]) {
      filename = raportStatusMap[filename];
    }
    const composedName = filename + (regNumber ? "_" + regNumber : "");
    a.href = link + "?newFileName=" + encodeURIComponent(composedName);
    a.setAttribute("download", composedName);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // shared handler for toggling link status fields (adminCheck, operator, discuss)
  const handleLinkToggle = async (elm, field, checked) => {
    try {
      setLoading(true);
      await RaportService.updateLinkStatus({ id: elm.id, [field]: checked });
      message.success(t('status_updated_successfully'));
      fetchData();
    } catch (err) {
      console.error(err);
      message.error(t('error_updating_status'));
    } finally {
      fetchData();
      setLoading(false);
    }
  };

  const raportStatusMap = RaportStatus.reduce((acc, item) => {
    acc[item.key] = item.label;
    return acc;
  }, {});

  const tableColumns = [
    {
      title: <UnorderedListOutlined />,
      dataIndex: "actions",
      width: "50px",
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
      title: t("№"),
      dataIndex: "number",
      width: "4%",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "number"),
      render: (text, record, index) => (
        <span>{total - ((pageNumber - 1) * pageSize + index)}</span>
      ),
    },
    {
      title: t("reg_number"),
      dataIndex: "regNumber",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "reg_number"),
      render: (_, elm) => {
        const text = (elm?.registrations || [])
          .map((r) => r.regNumber)
          .join(", ");

        const displayText =
          text.length > 10 ? text.substring(0, 10) + "..." : text;

        return (
          <Tooltip
            title={
              <div style={{ whiteSpace: "normal", wordBreak: "break-all", maxWidth: 400 }}>
                {text}
              </div>
            }
            overlayStyle={{ maxWidth: 500 }}
          >
            <span
              style={{
                cursor: "pointer",
                display: "inline-block",
                maxWidth: 200,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                verticalAlign: "middle",
              }}
            >
              {displayText}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: t("full_name"),
      dataIndex: "fullName",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "full_name"),
      render: (_, elm) => {
        const text = (elm?.registrations || [])
          .map((r) => r.fullName)
          .join(", ");

        const displayText =
          text.length > 10 ? text.substring(0, 10) + "..." : text;

        return (
          <Tooltip
            title={
              <div style={{ whiteSpace: "normal", wordBreak: "break-all", maxWidth: 400 }}>
                {text}
              </div>
            }
            overlayStyle={{ maxWidth: 500 }}
          >
            <span
              style={{
                cursor: "pointer",
                display: "inline-block",
                maxWidth: 200,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                verticalAlign: "middle",
              }}
            >
              {displayText}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: t("name"),
      dataIndex: "name",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "name"),
      render: (_, elm) => {
        return categoriesOfRaports.find((item) => item.key === elm?.raport?.name)?.label || "";
      },
    },
    {
      title: t("admin_check"),
      dataIndex: "adminCheck",
      width: "12%",
      render: (_, elm) => {
        const value = elm?.adminCheck;
        return (
          <Switch
            checked={value === true}
            onChange={(checked) => handleLinkToggle(elm, 'adminCheck', checked)}
            checkedChildren={t('yes')}
            unCheckedChildren={t('no')}
          />
        );
      },
    },
    {
      title: t("operator"),
      dataIndex: "operator",
      width: "18%",
      render: (_, elm) => {
        const value = elm?.operator;
        return (
          <Switch
            checked={value === true}
            onChange={(checked) => handleLinkToggle(elm, 'operator', checked)}
            checkedChildren={t('yes')}
            unCheckedChildren={t('no')}
          />
        );
      },
    },
    {
      title: t("discuss"),
      dataIndex: "discussCheck",
      width: "18%",
      render: (_, elm) => {
        const value = elm?.discussCheck;
        return (
          <Switch
            checked={value == true}
            onChange={(checked) => handleLinkToggle(elm, 'discuss', checked)}
            checkedChildren={t('yes')}
            unCheckedChildren={t('no')}
          />
        );
      },
    },

    {
      title: t("download"),
      render: (_, elm) => {
        const handleDownload = () => {
          const link = elm?.raport?.link;
          if (!link) {
            message.warning(t("no_link_available"));
            return;
          }

          // Get regNumber
          let regNumber = "";
          if (Array.isArray(elm?.registrations) && elm.registrations.length > 0) {
            regNumber = elm.registrations.length > 1
              ? elm.registrations.map((r) => r?.regNumber).filter(Boolean).join("_")
              : (elm?.registrations?.[0]?.regNumber || "");
          } else {
            regNumber = elm?.registration?.regNumber || "";
          }

          // Get name from raport
          const raportName = elm?.raport?.name || "";
          const nameLabel = categoriesOfRaports.find((item) => item.key === raportName)?.label || raportName;

          // Create filename: name_regNumber
          let filename = nameLabel;
          if (regNumber) {
            filename = `${nameLabel}_${regNumber}`;
          }

          // Download file
          const a = document.createElement("a");
          a.href = link + "?newFileName=" + encodeURIComponent(filename);
          a.setAttribute("download", filename);
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        };

        return (
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              type="primary"
              onClick={handleDownload}
            >
              <DownloadOutlined /> {t("download")}
            </Button>
            <Button type="default" onClick={() => openUploadModal(elm)}>
              <UploadOutlined /> {t("upload")}
            </Button>
          </div>
        );
      },
    },

    {
      title: t("link"),
      dataIndex: "link",
      width: "15%",
      render: (_, elm) => {
        // Get the first registration ID for navigation
        const registrationId = elm?.registrations && elm.registrations.length > 0
          ? elm.registrations[0].id
          : elm?.registration?.id;

        return registrationId ? (
          <Button
            onClick={() => {
              navigate(
                `/app/apps/register/info-register/${registrationId}?redirect=/app/raport-list&&search=${JSON.stringify(
                  search
                )}`
              );
            }}
          >
            <LinkOutlined /> {t("link")}
          </Button>
        ) : (
          <span>-</span>
        );
      },
    },
    {
      title: t("executor"),
      dataIndex: "executor",
      render: (_, elm) => (
        <p
          style={{ cursor: "pointer" }}
          onClick={() =>
            navigate(
              `/app/apps/admin/info-admin/${elm?.raport?.executor?.id}?redirect=/app/raport-list`
            )
          }
        >
          {elm?.raport?.executor?.first_name
            ? elm?.raport?.executor?.first_name
            : ""}{" "}
          {elm?.raport?.executor?.last_name
            ? elm?.raport?.executor?.last_name
            : ""}
        </p>
      ),
    },
    {
      title: t("updated_at"),
      dataIndex: "updatedAt",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "updated_at"),
      width: "15%",
      render: (updatedAt) => (
        <>{updatedAt ? getDateString(updatedAt) : t("unknown")}</>
      ),
    },
  ];


  return (
    <>
      <Card>
        <Flex
          flexDirection="column"
          mobileFlex={false}
          style={{ width: '100%' }}
        ><Flex className="mb-2" justifyContent="flex-end">
            <div className="mb-3 d-flex gap-2" style={{ alignItems: 'center', gap: 12 }}>
              <ProviderComponent rolePermission={["admin", "user", "superAdmin"]}>
                {/* <Button
                onClick={() => { goToSearch() }}
                type="primary"
                icon={<PlusCircleOutlined />}
                block
              >
                {t("add")}
              </Button> */}
                <Button className="ml-2" onClick={() => { backHandle() }}><LeftCircleOutlined />{t("back")}</Button>
              </ProviderComponent>
            </div>
          </Flex>
          <div style={{ width: '100%', marginBottom: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' }}>
              <Input
                placeholder={t("full_name")}
                value={search.fullName}
                onChange={(e) => setSearch({ ...search, fullName: e.target.value })}
                style={{ flex: '1 1 200px', minWidth: 160 }}
                allowClear
              />
              <Select
                showSearch
                placeholder={t("name")}
                value={search?.name || undefined}
                allowClear
                onChange={(val) => {
                  setSearch({ ...search, name: val || "" });
                }}
                options={categoriesOfRaports.map((it) => ({ value: it.key, label: it.label }))}
                style={{ flex: '1 1 180px', minWidth: 150 }}
              />
              <Select
                showSearch
                allowClear
                placeholder={t("executor")}
                style={{ flex: '1 1 180px', minWidth: 150 }}
                value={search.executor || undefined}
                optionFilterProp="label"
                onChange={(value) => setSearch({ ...search, executor: value || "" })}
                onSearch={debouncedFetchExecutor}
                loading={executorFetching}
                filterOption={false}   // important for remote search
                notFoundContent={executorFetching ? t("loading") : t("not_found")}
                options={executorOptions}
              />
              <Select
                placeholder={t("admin_check")}
                value={search.adminCheck}
                onChange={(val) => setSearch({ ...search, adminCheck: val })}
                options={[
                  { label: t('all_admin') || 'all', value: 'all' },
                  { label: t('yes'), value: 'yes' },
                  { label: t('no'), value: 'no' },
                ]}
                style={{ flex: '1 1 150px', minWidth: 130 }}
                optionFilterProp="label"
              />
              <Select
                placeholder={t("operator")}
                value={search.operator}
                onChange={(val) => setSearch({ ...search, operator: val })}
                options={[
                  { label: t('all_operator') || 'all', value: 'all' },
                  { label: t('yes'), value: 'yes' },
                  { label: t('no'), value: 'no' },
                ]}
                style={{ flex: '1 1 150px', minWidth: 130 }}
                optionFilterProp="label"
              />
              <Select
                placeholder={t("discuss")}
                value={search.discuss}
                onChange={(val) => setSearch({ ...search, discuss: val })}
                options={[
                  { label: t('all_discuss') || 'all', value: 'all' },
                  { label: t('yes'), value: 'yes' },
                  { label: t('no'), value: 'no' },
                ]}
                style={{ flex: '1 1 150px', minWidth: 130 }}
                optionFilterProp="label"
              />
              <Input
                placeholder={t("registration4")}
                value={search.registration4}
                onChange={(e) => setSearch({ ...search, registration4: e.target.value })}
                style={{ flex: '1 1 200px', minWidth: 160 }}
                allowClear
              />
            </div>
          </div>

        </Flex>
        <div className="table-responsive">
          <Table
            columns={tableColumns}
            dataSource={list.map((elm) => ({
              ...elm,
              birth_datev1: getDateDayString(elm?.birth_date),
            }))}
            rowKey="id"
            loading={loading}
            pagination={false}

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
                pageSizeOptions={["10", "20", "50", "100"]}
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

      {/* 🔹 Upload Modal */}
      <Modal
        title={t("upload_new_file")}
        open={isModalOpen}
        onCancel={handleCancel}
        onOk={handleUploadSubmit}
        okText={t("ok")}
        cancelText={t("cancel")}
        confirmLoading={loading}
      >
        <Dragger
          {...uploadProps}
          maxCount={1}
          style={{
            padding: 2,
            borderRadius: 12,
          }}
        >
          <p className="ant-upload-drag-icon">
            <UploadOutlined />
          </p>
          <p className="ant-upload-text">
            {t("upload")}
          </p>
        </Dragger>
      </Modal>
    </>
  );
};

export default RaportList;
