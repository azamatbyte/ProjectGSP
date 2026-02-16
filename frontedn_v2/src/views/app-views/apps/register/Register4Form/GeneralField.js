import React, { useEffect, useState, useRef } from "react";
import {
  Input,
  Row,
  Col,
  Card,
  Form,
  Select,
  DatePicker,
  InputNumber,
  message,
  Checkbox,
  Table,
  Tag,
} from "antd";
import dayjs from "dayjs";
import { Button } from "antd";
import {
  EditOutlined,
  EyeOutlined,
  UnorderedListOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import debounce from "lodash/debounce";
import WorkPlaceService from "services/WorkPlaceService";
import FormService from "services/FormService";
import RegistrationService from "services/RegistrationService";
import InitiatorService from "services/InitiatorService";
import { getDateDayString, getDateString } from "utils/aditionalFunctions";
import AccessStatusService from "services/AccessStatusService";
import { useTranslation } from "react-i18next";
import Flex from "components/shared-components/Flex";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT } from "constants/DateConstant";

const { Option } = Select;

const fetchWorkplaces = async (searchText) => {
  try {
    const response = await WorkPlaceService.getList(1, 5, searchText);

    return response?.data?.workplaces;
  } catch (error) {
    console.error("Xatolik:", error);
    return [];
  }
};

const fetchForms = async (searchText) => {
  try {
    const response = await FormService.listWithStatus(
      1,
      10,
      searchText,
      "registration4"
    );
    return response?.data?.forms;
  } catch (error) {
    console.error("Xatolik:", error);
    return [];
  }
};

const fetchAccessStatus = async (searchText) => {
  try {
    const response = await AccessStatusService.listWithStatus(1, 5, searchText);
    return response?.data?.accessStatuses;
  } catch (error) {
    console.error("Xatolik:", error);
    return [];
  }
};

const fetchInitiators = async (searchText) => {
  try {
    const response = await InitiatorService.getList(1, 5, searchText);
    return response?.data?.data?.map((item) => ({
      full_name: item?.first_name + " " + item?.last_name,
      id: item?.id,
    }));
  } catch (error) {
    console.error("Xatolik:", error);
    return [];
  }
};


const GeneralField = (props) => {
  const { t } = useTranslation();
  const { mode, id, setIsEdit,  modelProps, regNumber } =
    props;

  const [workplaceOptions, setWorkplaceOptions] = useState([]);
  const [formOptions, setFormOptions] = useState([]);
  const [accessStatusOptions, setAccessStatusOptions] = useState([]);
  const [initiatorOptions, setInitiatorOptions] = useState([]);
  const [workplaceFetching, setWorkplaceFetching] = useState(false);
  const [initiatorFetching, setInitiatorFetching] = useState(false);
  const [accessStatusFetching, setAccessStatusFetching] = useState(false);
  const firstNameInputRef = useRef(null);
  const [isReadOnly, setIsReadOnly] = useState(false);

  const [dataSource, setDataSource] = useState([]);
  const [isModalVisible] = useState(false);

  const [relativePageSize, setRelativePageSize] = useState(10);
  const [relativePageNumber, setRelativePageNumber] = useState(1);
  const [relativeTotal, setRelativeTotal] = useState(0);

  const [loading, setLoading] = useState(false);
  const [sortField, setSortField] = useState(null);
  const [sortOrder, setSortOrder] = useState(null);

  const completeStatus = [
    { key: "WAITING", label: t("waiting") },
    { key: "COMPLETED", label: t("completed") },
    { key: "REJECTED", label: t("rejected") },
  ];

  const checkRegNumberInDB = async (value) => {
    try {
      if (mode === "EDIT") {
        const response = await RegistrationService.checkRegNumber(value, id);
        if (response.status === 200) {
          return true;
        }
        return false;
      } else {
        const response = await RegistrationService.checkRegNumber(value);
        if (response.status === 200) {
          return true;
        }
        return false;
      }
    } catch (error) {
      console.error(t("error_checking_reg_number"), error);
      throw error;
    }
  };

  const debouncedCheckRegNumber = debounce((value, resolve, reject) => {
    checkRegNumberInDB(value)
      .then((isValid) => {
        if (isValid) {
          resolve();
        } else {
          reject(t("reg_number_already_exists"));
        }
      })
      .catch(() => {
        reject(t("error_checking_reg_number"));
      });
  }, 500);

  useEffect(() => {
    if (isModalVisible && firstNameInputRef.current) {
      firstNameInputRef.current.focus();
    }
  }, [isModalVisible]);

  useEffect(() => {
    const fetchData = async () => {
      const data = await fetchForms("");
      const accessStatuses = await fetchAccessStatus("");
      const initiators = await fetchInitiators("");
      const workplaces = await fetchWorkplaces("");
      setFormOptions(
        data.map((item) => ({
          value: item?.name,
          label: item?.name,
        }))
      );
      setAccessStatusOptions(
        accessStatuses.map((item) => ({
          value: item?.name,
          label: item?.name,
        }))
      );
      setInitiatorOptions(
        initiators.map((item) => ({
          value: item?.id,
          label: item?.full_name,
          id: item?.id,
        }))
      );
      setWorkplaceOptions(
        workplaces.map((item) => ({
          value: item?.name,
          label: item?.name,
        }))
      );
    };
    fetchData();
  }, []);

  useEffect(() => {
    setIsReadOnly(props.isReadOnly);
  }, [props.isReadOnly]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        if (regNumber !== "") {
          const sortParam = sortField && sortOrder
            ? { sort: { [sortField]: sortOrder.toLowerCase() } }
            : undefined;
          const data = await RegistrationService.getList(
            relativePageNumber,
            relativePageSize,
            "registration4",
            { regNumber: regNumber },
            sortParam
          );
          setDataSource(data?.data?.registrations);
          setRelativeTotal(data?.data?.total_registrations);
        } else {
          setDataSource([]);
          setRelativeTotal(0);
        }
      } catch (error) {
        setDataSource([]);
        setRelativeTotal(0);
        console.error("Xatolik:", error);
        message.error(t("error_fetching_data_relatives"));
      } finally {
        setLoading(false);
      }
    };
    if (mode !== "EDIT") {
      fetchData();
    }
  }, [regNumber, relativePageNumber, relativePageSize, mode, t, sortField, sortOrder]);

  const debouncedFetchWorkplaces = debounce(async (searchText) => {
    if (searchText.length > 2) {
      setWorkplaceFetching(true);
      const data = await fetchWorkplaces(searchText);
      setWorkplaceOptions(
        data.map((item) => ({
          value: item.name,
          label: item.name,
        }))
      );
      setWorkplaceFetching(false);
    }
  }, 500);

  const debouncedFetchAccessStatus = debounce(async (searchText) => {
    if (searchText.length >= 1) {
      setAccessStatusFetching(true);
      const data = await fetchAccessStatus(searchText);
      setAccessStatusOptions(
        data.map((item) => ({
          value: item.name,
          label: item.name,
        }))
      );
      setAccessStatusFetching(false);
    }
  }, 500);

  const dropdownMenu = (row) => ({
    items: [
      {
        key: "view-details",
        label: (
          <Flex alignItems="center">
            <EyeOutlined />
            <span className="ml-2">{t("view_details")}</span>
          </Flex>
        )
      },
      {
        key: "edit",
        label: (
          <Flex alignItems="center">
            <EditOutlined />
            <span className="ml-2">{t("edit")}</span>
          </Flex>
        )
      },
      {
        key: "update-reg-number",
        label: (
          <Flex alignItems="center">
            <EditOutlined />
            <span className="ml-2">{t("update_reg_number")}</span>
          </Flex>
        )
      },
      {
        key: "add-relative",
        label: (
          <Flex alignItems="center">
            <UserAddOutlined />
            <span className="ml-2">{t("add_relative")}</span>
          </Flex>
        )
      }
    ]
   });

  const debouncedFetchInitiators = debounce(async (searchText) => {
    if (searchText.length >= 1) {
      setInitiatorFetching(true);
      const initiators = await fetchInitiators(searchText);
      setInitiatorOptions(
        initiators.map((item) => ({
          value: item?.id,
          label: item?.full_name,
          id: item?.id,
        }))
      );
      setInitiatorFetching(false);
    }
  }, 500);

  const setConclusion = (value) => {
    if (
      value.target.checked &&
      props.form.getFieldValue("regNumber") &&
      props.form.getFieldValue("form_reg")
    ) {
      const conclusionRegNum =
        props.form.getFieldValue("regNumber") +
        " ф-" +
        props.form.getFieldValue("form_reg");
      props.form.setFieldsValue({ conclusionRegNum: conclusionRegNum });
    } else {
      props.form.setFieldsValue({ conclusionRegNum: "" });
    }
  };

  const handleEdit = () => {
    setIsEdit(true);
  };

  const rules = {
    regnumber: [
      {
        required: true,
        message: t("please_enter_the_registration_number"),
      },
      ({ getFieldValue }) => ({
        validator(_, value) {
          if (!value) return Promise.resolve();
          return new Promise((resolve, reject) => {
            debouncedCheckRegNumber(value, resolve, reject);
          });
        },
        validateTrigger: ["onChange"],
      }),
    ],
    completeStatus: [
      {
        // required: true,
        defaultValue: "WAITING",
        message: t("required_field"),
      },
    ],
    error: [
      {
        required: true,
        message: t("required_field"),
      },
    ],
  };

  const handleTableChange = (pagination, filters, sorter) => {
    if (sorter?.field && sorter?.order) {
      setSortField(sorter.field);
      setSortOrder(sorter.order === "ascend" ? "ASC" : "DESC");
    } else {
      setSortField(null);
      setSortOrder(null);
    }
  };

  const tableColumns = [
    {
      title: t("reg_number"),
      dataIndex: "regNumber",
      width: "2%",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder: sortField === "regNumber" ? (sortOrder === "ASC" ? "ascend" : "descend") : null,
    },
    {
      title: t("access_status"),
      dataIndex: "accessStatus",
      width: "7%",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder: sortField === "accessStatus" ? (sortOrder === "ASC" ? "ascend" : "descend") : null,
      render: (accessStatus, elm) => (
        <>
          {/* {(accessStatus !== 'ДОПУСК' && accessStatus !== null) ?
						<Tag
							color={new Date(elm?.expired) < new Date()
								? 'red'
								: accessStatus === 'ДОПУСК'
									? 'green'
									: 'orange'
							}
						>{accessStatus}</Tag> : <></>} */}
          {(accessStatus === "ДОПУСК" && accessStatus !== null) ||
            accessStatus.toLowerCase().includes("снят") ? (
            <Tag
              style={{ whiteSpace: "normal", wordWrap: "break-word" }}
              color={
                new Date(elm?.expired) < new Date()
                  ? "red"
                  : accessStatus === "ДОПУСК" ||
                    accessStatus.toLowerCase().includes("снят")
                    ? "green"
                    : "orange"
              }
            >
              {accessStatus}
            </Tag>
          ) : (
            <>
              {accessStatus === "IN_PROGRESS" || accessStatus === "ПРОВЕРКА" ? (
                <Tag color="blue">{t("in_progress")}</Tag>
              ) : (
                <Tag
                  style={{ whiteSpace: "normal", wordWrap: "break-word" }}
                  color="orange"
                >
                  {accessStatus}
                </Tag>
              )}
            </>
          )}
        </>
      ),
    },
    {
      title: t("full_name"),
      dataIndex: "fullName",
      width: "10%",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder: sortField === "fullName" ? (sortOrder === "ASC" ? "ascend" : "descend") : null,
      render: (fullName) => (
        <span style={{ whiteSpace: "normal", wordWrap: "break-word" }}>
          {fullName}
        </span>
      ),
    },
    {
      title: t("form"),
      dataIndex: "form_reg",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder: sortField === "form_reg" ? (sortOrder === "ASC" ? "ascend" : "descend") : null,
    },
    {
      title: t("birth_date"),
      dataIndex: "birthDate",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder: sortField === "birthDate" ? (sortOrder === "ASC" ? "ascend" : "descend") : null,
      render: (_, elm) => (
        <>
          {elm?.birthDate !== null && elm?.birthDate !== "Неизвестно"
            ? getDateDayString(elm?.birthDate)
            : elm?.birthYear
              ? elm?.birthYear
              : ""}
        </>
      ),
    },
    {
      title: t("birth_place"),
      dataIndex: "birthPlace",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder: sortField === "birthPlace" ? (sortOrder === "ASC" ? "ascend" : "descend") : null,
    },
    {
      title: t("work_place"),
      dataIndex: "workplace",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder: sortField === "workplace" ? (sortOrder === "ASC" ? "ascend" : "descend") : null,
      render: (workplace, elm) => {
        if (workplace) {
          if (elm?.position) {
            return elm?.workplace + ", " + elm?.position;
          }
          return elm?.workplace;
        } else if (elm?.position) {
          return elm?.position;
        }
        return "-";
      },
    },
    {
      title: t("residence"),
      dataIndex: "residence",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder: sortField === "residence" ? (sortOrder === "ASC" ? "ascend" : "descend") : null,
      render: (residence) => (
        <p>
          {residence?.length > 100
            ? residence.slice(0, 100) + "..."
            : residence}
        </p>
      ),
    },
    {
      title: t("notes"),
      dataIndex: "notes",
      render: (notes) => (
        <p>{notes?.length > 100 ? notes.slice(0, 100) + "..." : notes}</p>
      ),
    },
    {
      title: t("additional_notes"),
      dataIndex: "additionalNotes",
      render: (additionalNotes) => (
        <p>
          {additionalNotes?.length > 100
            ? additionalNotes.slice(0, 100) + "..."
            : additionalNotes}
        </p>
      ),
    },
    {
      title: t("initiator"),
      dataIndex: "initiator",
      render: (_, elm) => {
        return (
          <>
            {elm?.Initiator?.first_name} {elm?.Initiator?.last_name}
          </>
        );
      },
    },
    {
      title: t("executor"),
      dataIndex: "executor",
      render: (_, elm) => {
        return (
          <>
            {elm?.executor?.first_name} {elm?.executor?.last_name}
          </>
        );
      },
    },
    {
      title: t("updated_at"),
      dataIndex: "updatedAt",
      render: (updatedAt) => (
        <>{updatedAt ? getDateString(updatedAt) : t("unknown")}</>
      ),
    },
    {
      title: <UnorderedListOutlined />,
      dataIndex: "actions",
      render: (_, elm) => (
        <div className="text-right">
          <EllipsisDropdown menu={dropdownMenu(elm)} />
        </div>
      ),
    },
  ];

  return (
    <Row gutter={16}>
      <Col xs={24} sm={24} md={17}>
        <Card title={t("basic_info")}>
          <Row gutter={16}>
            <Col xs={24} sm={24} md={12}>
              {mode === "EDIT" ? (
                <>
                  <Row gutter={24}>
                    <Col xs={24} sm={12} md={4}>
                      <Form.Item
                        name="form_reg"
                        label={t("form")}
                        rules={rules.error}
                      >
                        <Select
                          className="w-100"
                          style={{ minWidth: 60 }}
                          placeholder={t("select_form")}
                          onChange={(value) => {
                            props.form.setFieldsValue({ form_reg: value });
                          }}
                          tabIndex={1}
                          autoFocus
                          disabled={isReadOnly}
                        >
                          {formOptions.map((option) => (
                            <Option key={option.value} value={option.value}>
                              {option.label}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={10}>
                      <Form.Item
                        name="formtype"
                        label={t("form_type")}
                        style={{ display: mode === "EDIT" ? "block" : "none" }}
                      >
                        <Input
                          className="w-100"
                          style={{ minWidth: 50 }}
                          tabIndex={2}
                          maxLength={255}
                          disabled={isReadOnly}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={10}>
                      <Form.Item name="recordNumber" label={t("record_number")}>
                        <Input
                          className="w-100"
                          style={{ minWidth: 50 }}
                          tabIndex={2}
                          maxLength={255}
                          disabled={isReadOnly}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              ) : (
                <>
                  <Row gutter={24}>
                    <Col xs={24} sm={12} md={10}>
                      <Form.Item
                        name="form_reg"
                        label={t("form")}
                        rules={rules.error}
                      >
                        <Select
                          className="w-100"
                          style={{ minWidth: 80 }}
                          // placeholder={t('select_form')}
                          onChange={(value) => {
                            props.form.setFieldsValue({ form_reg: value });
                          }}
                          tabIndex={1}
                          autoFocus
                          disabled={isReadOnly}
                        >
                          {formOptions.map((option) => (
                            <Option key={option.value} value={option.value}>
                              {option.label}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={24} md={14}>
                      <Form.Item
                        name="regNumber"
                        label={t("reg_number")}
                        rules={
                          modelProps === "registration4" ? rules.error : rules.regnumber
                        }
                        hasFeedback
                        {...(modelProps === "registration" && {
                          validateTrigger: ["onChange"],
                        })}
                      >
                        <Input
                          className="w-100"
                          tabIndex={2}
                          disabled={isReadOnly}
                          maxLength={255}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              )}
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Row gutter={24}>
                <Col xs={24} sm={12} md={12}>
                  <Form.Item
                    name="regDate"
                    label={t("reg_date")}
                    initialValue={dayjs()}
                    rules={rules.error}
                    disabled={isReadOnly}
                  >
                    <DatePicker
                      format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                      className="w-100"
                      onChange={() => {
                        props.form.setFieldsValue({ completeStatus: "WAITING" });
                      }}
                      tabIndex={3}
                      disabled={isReadOnly}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={24} md={12}>
                  <Form.Item
                    name="or_tab"
                    label={t("initiator")}
                    rules={rules.error}
                  >
                    <Select
                      showSearch
                      className="w-100"
                      // placeholder={t('select_initiator')}
                      style={{ width: 200, cursor: "pointer" }}
                      optionFilterProp="children"
                      onChange={(value, option) => {
                        props.form.setFieldsValue({
                          or_tab: value,
                        });
                      }}
                      onSearch={debouncedFetchInitiators}
                      loading={initiatorFetching}
                      filterOption={false}
                      tabIndex={5}
                      options={initiatorOptions}
                      disabled={isReadOnly}
                    />
                  </Form.Item>
                  {/* <Form.Item name="or_tab" hidden={true}>
								<Input type="hidden" />
							</Form.Item> */}
                </Col>
              </Row>
            </Col>
            <Col xs={24} sm={24} md={24}>
              <Row gutter={24}>
                <Col xs={24} sm={24} md={8}>
                  <Form.Item
                    name="last_name"
                    label={t("last_name")}
                    rules={rules.error}
                  >
                    <Input
                      className="w-100"
                      maxLength={255}
                      tabIndex={7}
                      disabled={isReadOnly}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={24} md={8}>
                  <Form.Item
                    name="first_name"
                    label={t("first_name")}
                    rules={rules.error}
                  >
                    <Input
                      className="w-100"
                      maxLength={255}
                      tabIndex={6}
                      disabled={isReadOnly}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={24} md={8}>
                  <Form.Item
                    name="father_name"
                    label={t("father_name")}
                    rules={rules.error}
                  >
                    <Input
                      className="w-100"
                      maxLength={255}
                      tabIndex={8}
                      disabled={isReadOnly}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Col>
            <Col xs={24} sm={8} md={12}>
              <Form.Item name="birthYear" label={t("birth_date")} required>
                <InputNumber className="w-100" tabIndex={3} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="nationality" label={t("nationality")}>
                <Input className="w-100" tabIndex={9} disabled={isReadOnly} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="birthPlace" label={t("birth_place")}>
                <Input
                  className="w-100"
                  maxLength={255}
                  tabIndex={10}
                  disabled={isReadOnly}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="residence" label={t("residence")}>
                <Input
                  className="w-100"
                  maxLength={255}
                  tabIndex={11}
                  disabled={isReadOnly}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="workplace" label={t("workplace")}>
                <Select
                  className="w-100"
                  placeholder={t("workplace")}
                  showSearch
                  style={{ width: 200, cursor: "pointer" }}
                  optionFilterProp="children"
                  onChange={(value) => {
                    props.form.setFieldsValue({ workplace: value });
                  }}
                  onSearch={(searchText) => {
                    if (searchText.length === 0) {
                      fetchWorkplaces("").then((data) => {
                        setWorkplaceOptions(
                          data.map((item) => ({
                            value: item.name,
                            label: item.name,
                          }))
                        );
                      });
                    } else {
                      debouncedFetchWorkplaces(searchText);
                    }
                  }}
                  loading={workplaceFetching}
                  filterOption={false}
                  tabIndex={15}
                  options={workplaceOptions}
                  disabled={isReadOnly}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={12}>
              <Form.Item name="position" label={t("position")}>
                <Input
                  className="w-100"
                  maxLength={255}
                  tabIndex={16}
                  disabled={isReadOnly}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={12}>
              <Form.Item name="recordNumber" label={t("record_number")}>
                <Input
                  className="w-100"
                  style={{ minWidth: 90 }}
                  tabIndex={2}
                  disabled={isReadOnly}
                  maxLength={255}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row justify="space-between" style={{ marginTop: "20px" }}>
            {mode === "EDIT" ? (
              <Col>
                <Button
                  type="primary"
                  onClick={handleEdit}
                  htmlType="submit"
                  tabIndex={14}
                  style={{ width: "120px" }}
                >
                  {t("edit")}
                </Button>
              </Col>
            ) : (
              <Col></Col>
            )}
            <Col>
              <Button
                type="primary"
                htmlType="submit"
                tabIndex={14}
                style={{ width: "120px" }}
              >
                {t("save")}
              </Button>
            </Col>
          </Row>
        </Card>
      </Col>
      <Col xs={24} sm={24} md={7}>
        <Card>
          <Col xs={24} sm={24} md={24}>
            <Row gutter={24}>
              <Col span={8}>
                <Form.Item label={t("status")}>
                  <Checkbox.Group>
                    <Row>
                      <Col span={12}>
                        <Checkbox
                          onClick={(e) => setConclusion(e)}
                          disabled={isReadOnly}
                        >
                          {t("conclusion")}
                        </Checkbox>
                      </Col>
                    </Row>
                  </Checkbox.Group>
                </Form.Item>
              </Col>
              <Col span={16}>
                <Form.Item
                  name="conclusionRegNum"
                  label={t("conclusion_number")}
                >
                  <Input
                    className="w-100"
                    maxLength={255}
                    tabIndex={12}
                    disabled={isReadOnly}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Col>
          <Col xs={24} sm={24} md={24}>
            <Form.Item
              name="regEndDate"
              label={t("reg_end_date")}
              placeholder={t("reg_end_date_placeholder")}
              disabled={isReadOnly}
            >
              <DatePicker
                format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                className="w-100"
                onChange={() => {
                  props.form.setFieldsValue({ completeStatus: "COMPLETED" });
                }}
                tabIndex={4}
                disabled={isReadOnly}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={24} md={24}>
            <Form.Item
              name="completeStatus"
              label={t("complete_status")}
              rules={rules.completeStatus}
            >
              <Select
                className="w-100"
                style={{ minWidth: 180 }}
                placeholder={t("select_a_form")}
                onChange={(value) => {
                  props.form.setFieldsValue({ completeStatus: value });
                }}
                tabIndex={1}
                autoFocus
                defaultValue={"WAITING"}
                disabled={isReadOnly}
              >
                {completeStatus.map((option) => (
                  <Option key={option.key} value={option.key}>
                    {option.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} sm={24} md={24}>
            <Form.Item name="accessStatus" label={t("access_status")}>
              <Select
                className="w-100"
                placeholder={t("access_status")}
                showSearch
                style={{ width: 200, cursor: "pointer" }}
                optionFilterProp="children"
                onChange={(value) => {
                  props.form.setFieldsValue({ accessStatus: value });
                }}
                defaultValue={"ПРОВЕРКА"}
                onSearch={(searchText) => {
                  if (searchText.length === 0) {
                    fetchAccessStatus("").then((data) => {
                      setAccessStatusOptions(
                        data.map((item) => ({
                          value: item.name,
                          label: item.name,
                        }))
                      );
                    });
                  } else {
                    debouncedFetchAccessStatus(searchText);
                  }
                }}
                loading={accessStatusFetching}
                filterOption={false}
                tabIndex={15}
                options={accessStatusOptions}
                disabled={isReadOnly}
              />
            </Form.Item>
          </Col>
        </Card>
        <Card>
          <Form.Item name="notes" label={t("note")} style={{ flex: 1 }}>
            <Input.TextArea
              className="w-100"
              tabIndex={17}
              style={{ height: "152px", resize: "none" }}
              disabled={isReadOnly}
            />
          </Form.Item>
        </Card>
        <Card>
          <Form.Item
            name="additionalNotes"
            label={t("additional_note")}
            style={{ flex: 1 }}
          >
            <Input.TextArea
              className="w-100"
              tabIndex={18}
              style={{ height: "152px", resize: "none" }}
              disabled={isReadOnly}
            />
          </Form.Item>
        </Card>
      </Col>
      {modelProps === "registration4" ? (
        <Col xs={24} sm={24} md={24} style={{ marginTop: 16 }}>
          <Card title={t("addiasdasdtional_information")}>
            <Table
              columns={tableColumns}
              dataSource={dataSource}
              loading={loading}
              onChange={handleTableChange}
              pagination={{
                current: relativePageNumber,
                pageSize: relativePageSize,
                total: relativeTotal,
                showSizeChanger: true,
                pageSizeOptions: ["10", "20", "50"],
                onShowSizeChange: (current, size) => {
                  setRelativePageSize(size);
                  setRelativePageNumber(1);
                },
                onChange: (page, pageSize) => {
                  setRelativePageNumber(page);
                },
              }}
            />
          </Card>
        </Col>
      ) : (
        <></>
      )}
    </Row>
  );
};

export default GeneralField;
