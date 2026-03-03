import React, { useCallback, useEffect, useState } from "react";
import {
  Card,
  Table,
  Select,
  Button,
  message,
  Modal,
  Input,
  Row,
  Col,
  Form,
  Switch,
  Tooltip,
  Upload
} from "antd";
import {
  EditOutlined,
  FileExcelOutlined,
  UnorderedListOutlined,
  UploadOutlined,
  LinkOutlined
} from "@ant-design/icons";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import { useNavigate } from "react-router-dom";
// ...existing code...
import { getDateString } from "utils/aditionalFunctions";
import { useTranslation } from "react-i18next";
import RaportService from "services/RaportService";
import { useSelector } from "react-redux";
import ProviderComponent from "providerComponent";
import SignedListService from "services/SignedListService";
import { debounce } from "lodash";
import { RaportStatus } from "constants/RaportStatus";
import { categoriesOfRaports } from "utils/sessions";
import AuthService from "services/AuthService";
import { handleUpload } from "../../admin/AdminForm/GeneralField";
const { Option } = Select;
const TYPE4_INITIAL_STATE = {
  nationality: "",
  residence: "",
  passport: "",
  travel: "",
  additional_information: "",
};
const TYPE5_INITIAL_STATE = {
  passport: "",
  residence: "",
  time_period: "",
};

const hasValue = (value) => String(value ?? "").trim().length > 0;
const keepExistingOrDefault = (currentValue, defaultValue) =>
  hasValue(currentValue) ? currentValue : defaultValue || "";

const fetchSignedList = async (searchText) => {
  try {
    const response = await SignedListService.getList(
      1,
      5,
      searchText,
      "active"
    );
    return response?.data?.records?.map((item) => ({
      full_name:
        (item?.lastName ? item?.lastName : "") + " " +
        (item?.firstName ? item?.firstName?.slice(0, 1) + "." : "") + "" +
        (item?.fatherName ? item?.fatherName?.slice(0, 1) + "." : ""),
      id: item?.id,
    }));
  } catch (error) {
    console.error("Xatolik:", error);
    return [];
  }
};

const raportStatusMap = RaportStatus.reduce((acc, item) => {
  acc[item.key] = item.label;
  return acc;
}, {});

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

const RaportSP = ({ id, model, regNumber, avr }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [formAvr] = Form.useForm();
  const [formUpk] = Form.useForm();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [signedListOptions, setSignedListOptions] = useState([]);
  const [signedListFetching, setSignedListFetching] = useState(false);
  const [selectedValues, setSelectedValues] = useState([]);

  const [isModalVisibleMalumotnoma, setIsModalVisibleMalumotnoma] =
    useState(false);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isModalVisibleType4, setIsModalVisibleType4] = useState(false);
  const [type4Data, setType4Data] = useState(TYPE4_INITIAL_STATE);
  const [executorFetching, setExecutorFetching] = useState(false);
  const [executorOptions, setExecutorOptions] = useState([]);

  // 🔹 Modal holati uchun
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRaport, setSelectedRaport] = useState(null);
  const [search, setSearch] = useState({ adminCheck: "all", operator: "all", discuss: "all", fullName: "", name: "", executor: "", registration4: "" });
  const [fileList, setFileList] = useState([]);
  const [form] = Form.useForm();
  const [isModalVisibleType5, setIsModalVisibleType5] = useState(false);
  const [type5Data, setType5Data] = useState(TYPE5_INITIAL_STATE);

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

  const applyRegistrationDefaults = useCallback(() => {
    if (!avr) return;

    setType4Data((prev) => ({
      nationality: keepExistingOrDefault(prev?.nationality, avr?.nationality),
      residence: keepExistingOrDefault(prev?.residence, avr?.residence),
      passport: keepExistingOrDefault(prev?.passport, avr?.passport),
      travel: keepExistingOrDefault(prev?.travel, avr?.travel),
      additional_information: keepExistingOrDefault(
        prev?.additional_information,
        avr?.additional_information
      ),
    }));

    setType5Data((prev) => ({
      passport: keepExistingOrDefault(prev?.passport, avr?.passport),
      residence: prev?.residence || "",
      time_period: prev?.time_period || "",
    }));
  }, [avr]);

  useEffect(() => {
    formAvr.setFieldsValue({
      nationality: type4Data?.nationality || "",
      residence: type4Data?.residence || "",
      passport: type4Data?.passport || "",
      travel: type4Data?.travel || "",
      additional_information: type4Data?.additional_information || "",
    });
  }, [type4Data, formAvr]);

  useEffect(() => {
    formUpk.setFieldsValue({
      passport_number: type5Data?.passport || "",
      citezenship: type5Data?.residence || "",
      when: type5Data?.time_period || "",
    });
  }, [type5Data, formUpk]);

  useEffect(() => {
    applyRegistrationDefaults();
  }, [applyRegistrationDefaults]);

  useEffect(() => {
    if (isModalVisibleType4 || isModalVisibleType5) {
      applyRegistrationDefaults();
    }
  }, [isModalVisibleType4, isModalVisibleType5, applyRegistrationDefaults]);

  const [raport, setRaport] = useState("type123");
  const [malumotnomaRaport, setMalumotnomaRaport] = useState("type8");

  const raports = [
    { key: "type123", label: t("OSUMVD_OSUSGB_USP") },
    { key: "type6", label: t("ND_ND1") },
    { key: "type7", label: t("ND_ND2") },
    { key: "type4", label: t("AVR") },
    { key: "type5", label: t("UPK") },
  ];

  const malumotnomaRaports = [
    { key: "type8", label: t("bad_malumotnoma") },
    { key: "type9", label: t("good_malumotnoma") },
  ];

  const categories = [...raports, ...malumotnomaRaports, { key: "Заключение", label: t("Заключение") }];

  const { user } = useSelector((state) => state.auth);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await RaportService.listExecutor(
        pageNumber,
        pageSize,
        id,
        user?.id,
        search
      );
      setList(response?.data?.raports);
      setTotal(response?.data?.total_raports);
    } catch (error) {
      console.log(error);
      message.error(error?.message);
      setList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [pageNumber, pageSize, id, user?.id, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const fetchDataSignedList = async () => {
      const signedList = await fetchSignedList("");
      setSignedListOptions(
        signedList.map((item) => ({
          value: item?.id,
          label: item?.full_name,
          id: item?.id,
        }))
      );
    };
    fetchDataSignedList();
  }, []);

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


  const debouncedFetchSignedList = debounce(async (searchText = "") => {
    if (searchText.length >= 1) {
      setSignedListFetching(true);
      const signedList = await fetchSignedList(searchText);
      setSignedListOptions(
        signedList.map((item) => ({
          value: item?.id,
          label: item?.full_name,
          id: item?.id,
        }))
      );
      setSignedListFetching(false);
    }
  }, 500);

  const download = (link, filename, elm) => {
    const a = document.createElement("a");
    const fullName = elm?.registrations[0]?.fullName || "";
    if (raportStatusMap[filename]) {
      filename = raportStatusMap[filename];
    }
    a.href = link + "?newFileName=" + filename + "_" + fullName + "_" + regNumber;
    a.setAttribute("download", filename + "_" + fullName + "_" + regNumber);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const editRegistration = (row) => {
    navigate(
      `/app/raports/edit-raport/${row.id}?redirect=/app/apps/register/info-register/${id}`
    );
  };

  const dropdownMenu = (row, hasEditPermission) => {
    const items = [];

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
  const openUploadModal = (elm) => {
    setSelectedRaport(elm);
    setIsModalOpen(true);
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
        // Update the status after successful upload
        await RaportService.updateLinkStatus({
          id: selectedRaport?.id,
          adminCheck: true
        });
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

  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
    setFileList([]);
  };

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

  const tableColumns = [
    {
      title: <UnorderedListOutlined />,
      dataIndex: "actions",
      width: "15%",
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
      dataIndex: "raport",
      width: "15%",
      render: (_, elm) => (
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            type="primary"
            onClick={() =>
              download(
                elm?.raport?.link,
                elm?.raport?.name || "заключение",
                elm
              )
            }
          >
            {t("download")}
          </Button>
          <Button type="default" onClick={() => openUploadModal(elm)}>
            <UploadOutlined /> {t("upload")}
          </Button>
        </div>

      ),
    },

    {
      title: t("executor"),
      dataIndex: "executor",
      render: (_, elm) => (
        <div>
          {elm?.raport?.executor?.first_name
            ? elm?.raport?.executor?.first_name
            : ""}{" "}
          {elm?.raport?.executor?.last_name
            ? elm?.raport?.executor?.last_name
            : ""}
        </div>
      ),
      // sorter: (a, b) => utils.antdTableSorter(a, b, "executor"),
    },
    {
      title: t("created_at"),
      dataIndex: "createdAt",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "createdAt"),
      render: (createdAt) => <div>{getDateString(createdAt)}</div>,
    },
    {
      title: t("notes"),
      dataIndex: "notes",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "notes"),
      render: (_, elm) => {
        return <div>{elm?.raport?.notes}</div>;
      },
    },
  ];

  const generateReportAVR = async (name) => {
    try {
      const response = await RaportService.exportSpecialAVR({
        id: id,
        name: name,
        code: "avr",
        signListIds: selectedValues,
        ...type4Data,
      });
      const filename = raportStatusMap[name] || "АВР";
      const link = document.createElement("a");
      link.href = response?.data?.link + "?newFileName=" + filename + "_" + regNumber;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.log(error);
      message.error(error?.message);
    } finally {
      setIsModalVisibleType4(false);
      setIsModalVisible(true);
      setType4Data(TYPE4_INITIAL_STATE);
      setSelectedValues([]);
      formAvr.resetFields();
    }
  };
  const generateReportUPK = async (name) => {
    try {
      const upkPayload = {
        ...type5Data,
        passport: keepExistingOrDefault(type5Data?.passport, avr?.passport),
        residence: type5Data?.residence || "",
        time_period: type5Data?.time_period || "",
      };
      const response = await RaportService.exportSpecialUPK({
        id: id,
        name: name,
        code: "upk",
        signListIds: selectedValues,
        ...upkPayload,
      });
      const filename = raportStatusMap[name] || "UPK";
      const link = document.createElement("a");
      link.href = response?.data?.link + "?newFileName=" + filename + "_" + regNumber;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.log(error);
      message.error(error?.message);
    } finally {
      setIsModalVisibleType5(false);
      setIsModalVisible(true);
      setType5Data(TYPE5_INITIAL_STATE);
      setSelectedValues([]);
      formUpk.resetFields();
    }
  };
  const generateReportMalumotnoma = async (name) => {
    try {
      const response = await RaportService.exportSpecialMalumotnoma({
        id: id,
        name: name,
        code: name,
        signListIds: selectedValues,
      });
      const filename = raportStatusMap[name] || "МАЛУМОТНОМА";
      const link = document.createElement("a");
      link.href = response?.data?.link + "?newFileName=" + filename + "_" + regNumber;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.log(error);
      message.error(error?.message);
    } finally {
      setIsModalVisibleMalumotnoma(false);
      setSelectedValues([]);
      fetchData();
    }
  };
  const generateReport = async (name) => {
    try {
      if (name === "type123" || name === "type6" || name === "type7") {
        const response = await RaportService.exportSpecialAnalysis({
          id: id,
          name: name,
          signListIds: selectedValues,
        });
        const filename = raportStatusMap[name] || "Report";
        const link = document.createElement("a");
        link.href = response?.data?.link + "?newFileName=" + filename + "_" + regNumber;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else if (name === "type4") {
        try {
          setIsModalVisible(false);
          setIsModalVisibleType4(true);
        } catch (error) {
          console.error("Error generating report:", error);
        } finally {
          // setIsModalVisibleDetails(false);
          // setIsModalVisible(false);
        }
      } else if (name === "type5") {
        try {
          setType5Data((prev) => ({
            passport: keepExistingOrDefault(prev?.passport, avr?.passport),
            residence: "",
            time_period: prev?.time_period || "",
          }));
          setIsModalVisible(false);
          setIsModalVisibleType5(true);
        } catch (error) {
          console.error("Error generating report:", error);
        } finally {
          // setIsModalVisibleDetails(false);
          // setIsModalVisible(false);
        }
      }
    } catch (error) {
      console.error("Error generating report:", error);
    } finally {
      // setIsModalVisible(false);
      fetchData();
      setSelectedValues([]);
    }
  };

  const handleSignedListChange = (values, options) => {
    setSelectedValues(values);
  };
  const upkDisplayData = {
    passport: keepExistingOrDefault(type5Data?.passport, avr?.passport),
    residence: type5Data?.residence || "",
    time_period: type5Data?.time_period || "",
  };

  return (
    <>
      <Card>
        <Modal
          title={t("generate_malumotnoma")}
          open={isModalVisibleMalumotnoma}
          onOk={() => generateReportMalumotnoma(malumotnomaRaport)}
          onCancel={() => setIsModalVisibleMalumotnoma(false)}
        >
          <Select
            value={malumotnomaRaport}
            style={{ width: "100%", cursor: "pointer", marginBottom: "10px" }}
            onChange={(e) => setMalumotnomaRaport(e)}
            placeholder={t("select_option")}
          >
            {malumotnomaRaports.map((raport) => (
              <Option value={raport.key} key={raport.key}>
                {raport.label}
              </Option>
            ))}
          </Select>
          <Select
            mode="multiple" // enable multiple selections
            showSearch
            className="w-100"
            style={{ width: 200, cursor: "pointer", marginBottom: "10px" }}
            optionFilterProp="children"
            onChange={handleSignedListChange}
            onSearch={debouncedFetchSignedList}
            loading={signedListFetching}
            filterOption={false}
            tabIndex={5}
            options={signedListOptions}
            value={selectedValues} // controlled component
          />
        </Modal>
        <Modal
          title={t("generate_report")}
          open={isModalVisible}
          footer={null} // ❗ default OK / Cancel o‘chadi
          onCancel={() => setIsModalVisible(false)}
        >
          {/* Action bar (OK / Cancel yuqorida) */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <Button onClick={() => setIsModalVisible(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="primary"
              onClick={() => generateReport(raport)}
            >
              {t("ok")}
            </Button>
          </div>

          {/* Form */}
          <Select
            value={raport}
            style={{ width: "100%", marginBottom: 10 }}
            onChange={(e) => setRaport(e)}
            placeholder={t("select_option")}
          >
            {raports.map((raport) => (
              <Select.Option value={raport.key} key={raport.key}>
                {raport.label}
              </Select.Option>
            ))}
          </Select>

          {(raport === "type123" || raport === "type6" || raport === "type7") && (
            <Select
              mode="multiple"
              showSearch
              style={{ width: "100%", marginBottom: 10 }}
              optionFilterProp="children"
              onChange={handleSignedListChange}
              onSearch={debouncedFetchSignedList}
              loading={signedListFetching}
              filterOption={false}
              options={signedListOptions}
              value={selectedValues}
            />
          )}
        </Modal>
        <Modal
          title={t("generate_avr_report")}
          open={isModalVisibleType4}
          onOk={() => generateReportAVR(raport)}
          onCancel={() => {
            setIsModalVisibleType4(false);
            setIsModalVisible(true);
          }}
          okText={t("generate")}
          cancelText={t("cancel")}
          okButtonProps={{
            icon: <FileExcelOutlined />,
            tabIndex: 7,
          }}
          cancelButtonProps={{
            tabIndex: 8,
          }}
        >
          <Form layout="vertical" form={formAvr}>
            <Row gutter={16}>
              <Col span={12} md={12} xs={24}>
                <Form.Item
                  label={t("nationality")}
                  defaultValue="nationality"
                  rules={[{ required: true, message: t("required_field") }]}
                >
                  <Input
                    placeholder={t("nationality")}
                    value={type4Data?.nationality}
                    autoFocus={isModalVisibleType4}
                    tabIndex={1}
                    onChange={(e) =>
                      setType4Data({ ...type4Data, nationality: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={12} md={12} xs={24}>
                <Form.Item
                  label={t("residence")}
                  name="residence"
                  rules={[{ required: true, message: t("required_field") }]}
                >
                  <Input
                    placeholder={t("residence")}
                    value={type4Data?.residence}
                    tabIndex={2}
                    onChange={(e) =>
                      setType4Data({ ...type4Data, residence: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={12} md={12} xs={24}>
                <Form.Item
                  label={t("passport")}
                  name="passport"
                  rules={[{ required: true, message: t("required_field") }]}
                >
                  <Input
                    placeholder={t("passport")}
                    value={type4Data?.passport}
                    tabIndex={3}
                    onChange={(e) =>
                      setType4Data({ ...type4Data, passport: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={12} md={12} xs={24}>
                <Form.Item
                  label={t("where_and_when_travel")}
                  name="travel"
                  rules={[{ required: true, message: t("required_field") }]}
                >
                  <Input
                    placeholder={t("where_and_when_travel")}
                    value={type4Data?.travel}
                    tabIndex={4}
                    onChange={(e) =>
                      setType4Data({ ...type4Data, travel: e.target.value })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={12} md={12} xs={24}>
                <Form.Item
                  label={t("additional_information")}
                  name="additional_information"
                  rules={[{ required: true, message: t("required_field") }]}
                >
                  <Input
                    placeholder={t("additional_information")}
                    value={type4Data?.additional_information}
                    tabIndex={5}
                    onChange={(e) =>
                      setType4Data({
                        ...type4Data,
                        additional_information: e.target.value,
                      })
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={12} md={12} xs={24}>
                <Form.Item
                  label={t("signatories")}
                  name="signatories"
                  rules={[{ required: true, message: t("required_field") }]}
                  wrapperCol={{ span: 24 }}
                  className="w-100 no-label-padding"
                >
                  <Select
                    mode="multiple"
                    showSearch
                    optionFilterProp="children"
                    onChange={handleSignedListChange}
                    onSearch={debouncedFetchSignedList}
                    loading={signedListFetching}
                    filterOption={false}
                    tabIndex={6}
                    options={signedListOptions}
                    value={selectedValues}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Modal>
        <Modal
          title={t("generate_report")}
          open={isModalVisibleType5}
          onOk={() => generateReportUPK(raport)}
          onCancel={() => {
            setIsModalVisibleType5(false);
            setIsModalVisible(true);
          }}
          okText={t("generate")}
          okButtonProps={{
            icon: <FileExcelOutlined />,
            tabIndex: 5,
          }}
          cancelButtonProps={{
            tabIndex: 6,
          }}
        >
          <Form layout="vertical" form={formUpk}>
            <Row gutter={16}>
              <Col span={12} md={12} xs={24}>
                <Form.Item
                  label={t("passport")}
                  name="passport_number"
                  rules={[{ required: true, message: t("required_field") }]}
                >
                  <Input
                    placeholder={t("passport")}
                    value={upkDisplayData?.passport}
                    onChange={(e) =>
                      setType5Data({ ...type5Data, passport: e.target.value })
                    }
                    autoFocus={isModalVisibleType5}
                    tabIndex={1}
                  />
                </Form.Item>
              </Col>
              <Col span={12} md={12} xs={24}>
                <Form.Item
                  label={t("citezenship")}
                  name="citezenship"
                  rules={[{ required: true, message: t("required_field") }]}
                >
                  <Input
                    placeholder={t("citezenship")}
                    value={upkDisplayData?.residence}
                    onChange={(e) =>
                      setType5Data({ ...type5Data, residence: e.target.value })
                    }
                    tabIndex={2}
                  />
                </Form.Item>
              </Col>
              <Col span={12} md={12} xs={24}>
                <Form.Item
                  label={t("when")}
                  name="when"
                  rules={[{ required: true, message: t("required_field") }]}
                >
                  <Input
                    placeholder={t("when")}
                    value={upkDisplayData?.time_period}
                    onChange={(e) =>
                      setType5Data({ ...type5Data, time_period: e.target.value })
                    }
                    tabIndex={3}
                  />
                </Form.Item>
              </Col>
              <Col span={12} md={12} xs={24}>
                <Form.Item
                  label={t("signatories")}
                  name="signatories"
                  rules={[{ required: true, message: t("required_field") }]}
                  wrapperCol={{ span: 24 }}
                  style={{ cursor: "pointer" }}
                >
                  <Select
                    mode="multiple" // enable multiple selections
                    showSearch
                    className="w-100"
                    style={{ width: 200, cursor: "pointer" }}
                    optionFilterProp="children"
                    onChange={handleSignedListChange}
                    onSearch={debouncedFetchSignedList}
                    loading={signedListFetching}
                    filterOption={false}
                    tabIndex={4}
                    options={signedListOptions}
                    value={selectedValues} // controlled component
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Modal>
        <Flex
          alignItems="center"
          justifyContent="space-between"
          mobileFlex={false}
        >
          {model !== "registration4" && (
            <Flex className="mb-1" mobileFlex={false}>
              <div className="mr-md-3 mb-3">
                <Button
                  className="mr-2"
                  onClick={() => setIsModalVisible(true)}
                  type="primary"
                >
                  <FileExcelOutlined />
                  <span className="ml-2">{t("requirements")}</span>
                </Button>
              </div>
            </Flex>
          )}

          {model !== "registration4" && (
            <Flex className="mb-1" mobileFlex={false}>
              <div className="mr-md-3 mb-3">
                <Button
                  className="mr-2"
                  onClick={() => setIsModalVisibleMalumotnoma(true)}
                  type="primary"
                >
                  <FileExcelOutlined />
                  <span className="ml-2">{t("export_malumotnoma")}</span>
                </Button>
              </div>
            </Flex>
          )}



        </Flex>
        <Flex className="mb-1" mobileFlex={false}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, width: '100%' }}>
            <Select
              showSearch
              placeholder={t("name")}
              value={search?.name || undefined}
              allowClear
              onChange={(val) => {
                setSearch({ ...search, name: val || "" });
              }}
              options={categoriesOfRaports.map((it) => ({ value: it.key, label: it.label }))}
              style={{ minWidth: 150 }}
            />
            <Select
              showSearch
              allowClear
              placeholder={t("executor")}
              style={{ minWidth: 150 }}
              value={search.executor || undefined}
              optionFilterProp="label"
              onChange={(value) => setSearch({ ...search, executor: value || "" })}
              onSearch={debouncedFetchExecutor}
              loading={executorFetching}
              filterOption={false}
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
              style={{ minWidth: 150 }}
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
              style={{ minWidth: 150 }}
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
              style={{ minWidth: 150 }}
              optionFilterProp="label"
            />
            <Input
              placeholder={t("registration4")}
              value={search.registration4}
              onChange={(e) => setSearch({ ...search, registration4: e.target.value })}
              style={{ minWidth: 180, maxWidth: 220 }}
              allowClear
            />
          </div>
        </Flex>
        <div className="table-responsive">
          <Table
            columns={tableColumns}
            dataSource={list}
            // rowKey='id'
            loading={loading}
            // rowSelection={{
            // 	selectedRowKeys: selectedRowKeys,
            // 	type: 'checkbox',
            // 	preserveSelectedRowKeys: false,
            // 	...rowSelection,
            // }}
            pagination={{
              current: pageNumber,
              pageSize: pageSize,
              showSizeChanger: true,
              pageSizeOptions: ["10", "20", "50"],
              total: total,
              onChange: (pageNumber, pageSize) => {
                setPageNumber(pageNumber);
                setPageSize(pageSize);
              },
            }}
          />
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
        <Upload
          {...uploadProps}
          fileList={fileList}
          maxCount={1}
          onRemove={() => setFileList([])}
        >
          <Button icon={<UploadOutlined />}>{t("upload")}</Button>
        </Upload>
      </Modal>
    </>
  );
};

export default RaportSP;
