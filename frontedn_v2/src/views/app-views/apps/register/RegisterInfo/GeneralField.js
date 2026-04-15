import React, { useEffect, useState } from "react";
import {
  Input,
  Row,
  Col,
  Card,
  Form,
  Select,
  DatePicker,
  message,
  Checkbox,
  Modal,
} from "antd";
import { Button } from "antd";
import { FileExcelOutlined, CheckCircleOutlined } from "@ant-design/icons";
import RelativeService from "services/RelativeService";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT } from "constants/DateConstant";
import RelativeTable from "./RelativeTable";
import { useTranslation } from "react-i18next";
import Flex from "components/shared-components/Flex";
import RaportService from "services/RaportService";
import SessionService from "services/SessionService";
import { MODEL_TYPES, SESSION_TYPES } from "utils/sessions";
import SignedListService from "services/SignedListService";
import { debounce } from "lodash";
import { useNavigate } from "react-router-dom";

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
        (item?.lastName ? item?.lastName : "") +
        " " +
        (item?.firstName ? item?.firstName?.slice(0, 1) + "." : "") +
        "" +
        (item?.fatherName ? item?.fatherName?.slice(0, 1) + "." : ""),
      id: item?.id,
    }));
  } catch (error) {
    console.error("Xatolik:", error);
    return [];
  }
};

const { Option } = Select;

const GeneralField = (props) => {
  const {
    mode,
    id,
    redirect,
    search,
    formType,
    regNumber,
    model: modelProps,
    executorFullName,
  } = props;
  const { t } = useTranslation();
  const [model, setModel] = useState(MODEL_TYPES.RELATIVE);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  // Add state for requirements modal
  const [isRequirementsModalVisible, setIsRequirementsModalVisible] =
    useState(false);
  const [raport, setRaport] = useState("type7");
  const [selectedValues, setSelectedValues] = useState([]);
  const [signedListOptions, setSignedListOptions] = useState([]);
  const [signedListFetching, setSignedListFetching] = useState(false);
  const [isExportGSBPModalVisible, setIsExportGSBPModalVisible] = useState(false);
  const navigate = useNavigate();
  const conclusionRegNumValue = Form.useWatch("conclusionRegNum", props.form);

  const raports = [
    { key: "type7", label: t("ND_ND1") },
    { key: "type6", label: t("ND_ND2") },
  ];

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

  const handleAddCard = async (id, type, model = "") => {
    if (selectedRowKeys.length > 0) {
      try {
        const res = await SessionService.addRelatives({
          type: type,
          registrationId: id,
          ids: selectedRowKeys,
          model,
        });
        if (res.data.code === 201) {
          message.success(t("total") + ` ${res.data.addedCount}`);
          message.success(t("success"));
        }
      } catch (error) {
        message.error(t("error_adding_card"));
        console.log(error, "error");
      } finally {
        setSelectedRowKeys([]);
        message.success(t("card_added_successfully"));
      }
    } else {
      try {
        const res = await SessionService.addRelatives({
          type: type,
          registrationId: id,
          ids: selectedRowKeys.map((data) => data?.id),
          model,
        });
        if (res.data.code === 201) {
          message.success(t("total") + ` ${res.data.addedCount}`);
          message.success(t("success"));
        }
      } catch (error) {
        message.error(t("error_adding_card"));
        console.log(error, "error");
      }
    }
  };

  const handleExportRelativesSP = async (id, signListIds) => {
    const ids = [id];
    if (selectedRowKeys.length > 0) {
      selectedRowKeys?.forEach((id_selected) => {
        try {
          ids.push(id_selected);
        } catch (error) {
        } finally {
          // setSelectedRowKeys([]);
        }
      });
    } else {
      try {
        const relative = await RelativeService.allByRegistrationId(id);
        for (const item of relative?.data?.relatives) {
          try {
            ids.push(item?.id);
          } catch (error) { }
        }
      } catch (error) {
        message.error(t("error_fetching_data_relatives"));
        console.log(error, "error");
      }
    }
    const response = await RaportService.createRelativeList({ ids, signListIds });
    const link = response?.data?.link;
    const a = document.createElement("a");
    a.href = link + "?newFileName=Отправка СГБ/МВД/ГСБП";
    a.setAttribute("download", "Отправка СГБ/МВД/ГСБП");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setIsExportGSBPModalVisible(false);
    setSelectedValues([]);
  };

  // Add function to handle signed list change
  const handleSignedListChange = (values) => {
    setSelectedValues(values);
  };

  const debouncedFetchSignedList = debounce(async (searchText = "") => {
    if (searchText.length >= 1) {
      setSignedListFetching(true);
      const signedList = await fetchSignedList(searchText);
      console.log(signedList, "signedList");
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

  // Add function to generate report
  const generateReport = async (name) => {
    try {
      if (name === "type6" || name === "type7") {
        const response = await RaportService.generateOPRaport({
          id: id,
          name: name,
          ids: selectedRowKeys,
          signListIds: selectedValues,
        });
        const filename = "ND1,_ND2";
        const link = document.createElement("a");
        link.href = response?.data?.link + "?newFileName=" + filename;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error("Error generating report:", error);
      message.error(t("error_generating_report"));
    } finally {
      setIsRequirementsModalVisible(false);
      setSelectedValues([]);
    }
  };

  return (
    <>
      {/* Export GSBP Modal (choose signed list) */}
      <Modal
        title={t("export_data_GSBP")}
        open={isExportGSBPModalVisible}
        onOk={() => handleExportRelativesSP(id, selectedValues)}
        onCancel={() => {
          setIsExportGSBPModalVisible(false);
          setSelectedValues([]);
        }}
      >
        <Select
          mode="multiple"
          showSearch
          className="w-100"
          style={{ width: 200, cursor: "pointer", marginBottom: "10px" }}
          optionFilterProp="children"
          onChange={handleSignedListChange}
          onSearch={debouncedFetchSignedList}
          loading={signedListFetching}
          filterOption={false}
          options={signedListOptions}
          value={selectedValues}
        />
      </Modal>
      {/* Requirements Modal */}
      <Modal
        title={t("generate_report")}
        open={isRequirementsModalVisible}
        onOk={() => generateReport(raport)}
        onCancel={() => setIsRequirementsModalVisible(false)}
      >
        <Select
          value={raport}
          style={{ width: "100%", cursor: "pointer", marginBottom: "10px" }}
          onChange={(e) => setRaport(e)}
          placeholder={t("select_option")}
        >
          {raports.map((raport) => (
            <Option value={raport.key} key={raport.key}>
              {raport.label}
            </Option>
          ))}
        </Select>
        {(raport === "type6" || raport === "type7") && (
          <Select
            mode="multiple"
            showSearch
            className="w-100"
            style={{ width: 200, cursor: "pointer", marginBottom: "10px" }}
            optionFilterProp="children"
            onChange={handleSignedListChange}
            onSearch={debouncedFetchSignedList}
            loading={signedListFetching}
            filterOption={false}
            options={signedListOptions}
            value={selectedValues} // controlled component
          />
        )}
      </Modal>

      <Row gutter={16}>
        <Col xs={24} sm={24} md={17}>
          <Card title={t("basic_info")}>
            <Row gutter={16}>
              <Col xs={24} sm={24} md={12}>
                <Row gutter={24}>
                  <Col xs={24} sm={12} md={4}>
                    <Form.Item name="form_reg" label={t("form")}>
                      <Input
                        name="form_reg"
                        style={{ minWidth: 50 }}
                        readOnly
                      ></Input>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={10}>
                    <Form.Item name="formtype" label={t("form_type")}>
                      <Input
                        className="w-100"
                        style={{ minWidth: 50 }}
                        readOnly
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={10}>
                    <Form.Item
                      name="regNumber"
                      label={t("reg_number")}
                      hasFeedback
                      validateTrigger={["onChange"]}
                    >
                      <Input className="w-100" readOnly />
                    </Form.Item>
                  </Col>
                </Row>
              </Col>
              <Col xs={24} sm={24} md={12}>
                <Row gutter={24}>
                  <Col xs={24} sm={12} md={12}>
                    <Form.Item name="regDate" label={t("reg_date")}>
                      <DatePicker
                        format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                        className="w-100"
                        disabled
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={24} md={12}>
                    <Form.Item name="or_tab" label={t("initiator")}>
                      <Input readOnly />
                    </Form.Item>
                  </Col>
                  
                </Row>
              </Col>
              <Col xs={24} sm={24} md={8}>
                <Form.Item name="lastName" label={t("last_name")}>
                  <Input
                    className="w-100"
                    min={0}
                    max={100}
                    readOnly
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={8}>
                <Form.Item name="firstName" label={t("first_name")}>
                  <Input
                    className="w-100"
                    min={0}
                    max={100}
                    readOnly
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={8}>
                <Form.Item name="fatherName" label={t("father_name")}>
                  <Input
                    className="w-100"
                    min={0}
                    max={100}
                    readOnly
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={12}>
                {modelProps === MODEL_TYPES.REGISTRATION && (
                  <Form.Item name="birthDate" label={t("birth_date")}>
                    <DatePicker
                      className="w-100"
                      format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                      disabled
                    />
                  </Form.Item>
                )}
                {modelProps === MODEL_TYPES.REGISTRATION4 && (
                  <Form.Item name="birthYear" label={t("birth_year")}>
                    <Input
                      className="w-100"
                      readOnly
                    />
                  </Form.Item>
                )}
              </Col>
              {modelProps === "registration" && (
                <Col xs={24} sm={24} md={12}>
                  <Form.Item name="nationality" label={t("nationality")}>
                    <Input className="w-100" readOnly />
                  </Form.Item>
                </Col>
              )}
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="birthPlace" label={t("birth_place")}>
                  <Input
                    className="w-100"
                    min={0}
                    max={100}
                    readOnly
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="residence" label={t("residence")}>
                  <Input
                    className="w-100"
                    min={0}
                    max={100}
                    readOnly
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={12}>
                <Form.Item name="workplace" label={t("workplace")}>
                  <Input
                    className="w-100"
                    min={0}
                    max={100}
                    readOnly
                  />
                </Form.Item>
              </Col>
              {modelProps === "registration" && (
                <Col xs={24} sm={24} md={12}>
                  <Form.Item name="position" label={t("position")}>
                    <Input
                      className="w-100"
                      min={0}
                      max={100}
                      readOnly
                    />
                  </Form.Item>
                </Col>
              )}              
              <Col xs={24} sm={12} md={12}>
                <Form.Item name="passport" label={t("passport")}>
                  <Input
                    className="w-100"
                    style={{ minWidth: 50 }}
                    readOnly
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={12}>
                <Form.Item name="pinfl" label={t("pinfl")}>
                  <Input
                    className="w-100"
                    style={{ minWidth: 50 }}
                    readOnly
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={12}>
                <Form.Item name="recordNumber" label={t("record_list")}>
                  <Input
                    className="w-100"
                    style={{ minWidth: 50 }}
                    readOnly
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={12}>
                <Form.Item label={t("executor")}>
                  <Input value={executorFullName || "-"} readOnly />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={24}>
                <Form.Item name="notes" label={t("compr_info")} style={{ flex: 1 }}>
                  <Input.TextArea
                    className="w-100"
                    style={{ height: "80px", resize: "none" }}
                    readOnly
                  />
                </Form.Item>
              </Col>
            </Row>

          </Card>
        </Col>
        <Col xs={24} sm={24} md={7}>
          <Card>
            <Col xs={24} sm={24} md={24}>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label={t("status")}>
                    <Checkbox.Group value={!!conclusionRegNumValue ? ["conclusion"] : []}>
                      <Row>
                        <Col span={12}>
                          <Checkbox value="conclusion" onClick={(e) => setConclusion(e)} >
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
                      min={0}
                      max={100}
                      readOnly
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Col>
            <Col xs={24} sm={24} md={24}>
              <Form.Item name="regEndDate" label={t("reg_end_date")}>
                <DatePicker
                  format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                  className="w-100"
                  disabled
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={24}>
              <Form.Item name="completeStatus" label={t("complete_status")}>
                <Input
                  className="w-100"
                  min={0}
                  max={100}
                  readOnly
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={24}>
              <Form.Item name="accessStatus" label={t("access_status")}>
                <Input
                  className="w-100"
                  min={0}
                  max={100}
                  readOnly
                />
              </Form.Item
              >
            </Col>
          </Card>
          <Card>
            <Form.Item name="conclusion_compr" label={t("conclusion_compr")} style={{ flex: 1 }}>
              <Input.TextArea
                className="w-100"
                style={{ height: "80px", resize: "none" }}
                readOnly
              />
            </Form.Item>
          </Card>
          <Card>
            <Form.Item
              name="additionalNotes"
              label={t("additional_compr_info")}
              style={{ flex: 1 }}
            >
              <Input.TextArea
                className="w-100"
                style={{ height: "80px", resize: "none" }}
                readOnly
              />
            </Form.Item>
            <Form.Item name="externalNotes" label={t("moving")}>
              <Input
                className="w-100"
                min={0}
                maxLength={255}
                readOnly
              />
            </Form.Item>
          </Card>
        </Col>
        <Col xs={24} sm={24} md={24} style={{ marginTop: 16 }}>
          <Card title={t("additional_information")}>
            <Flex
              alignItems="center"
              justifyContent="space-between"
              mobileFlex={false}
            >
              <Flex className="mb-1" mobileFlex={false}>
                <div className="mr-md-3 mb-3">
                  {mode === "INFO" && (
                    <>
                      <Button
                        className="mr-2"
                        onClick={() => setIsExportGSBPModalVisible(true)}
                        type="primary"
                      >
                        <FileExcelOutlined />
                        <span className="ml-2">{t("export_data_GSBP")}</span>
                      </Button>
                      {modelProps === MODEL_TYPES.REGISTRATION &&
                        <Button
                          className="mr-2"
                          onClick={() => setIsRequirementsModalVisible(true)}
                          type="primary"
                        >
                          <FileExcelOutlined />
                          <span className="ml-2">{t("requirements_ND")}</span>
                        </Button>
                      }
                    </>
                  )}
                </div>
              </Flex>
              <Flex className="mb-1">
                <div className="mr-md-3 mb-3">
                  
                  <Button
                    type="primary"
                    className="mr-2"
                    onClick={() =>
                      handleAddCard(id, SESSION_TYPES.RAPORT, model)
                    }
                  >
                    {t("add_conclusion")}
                  </Button>
                  <Button
                    type="primary"
                    className="mr-2"
                    onClick={() =>
                      handleAddCard(id, SESSION_TYPES.SESSION, model)
                    }
                  >
                    {t("add_main")}
                  </Button>
                  <Button
                    type="primary"
                    className="mr-2"
                    onClick={() =>
                      handleAddCard(id, SESSION_TYPES.RESERVE, model)
                    }
                  >
                    {t("add_reserve")}
                  </Button>
                  {modelProps === MODEL_TYPES.REGISTRATION && (
                    <>
                      {
                        <Button
                          type="primary"
                          className="mr-2"
                          onClick={() =>
                            navigate(`/app/apps/relative/add-relative/${id}`)
                          }
                        >
                          <CheckCircleOutlined />
                          {t("add_new_relative")}
                        </Button>
                      }

                    </>
                  )}
                  {modelProps === MODEL_TYPES.REGISTRATION && (
                    <Select
                      placeholder={t("select_option")}
                      style={{ width: "170px" }}
                      onChange={(value) => {
                        if (value === "All") {
                          setModel(MODEL_TYPES.ALL);
                        } else {
                          setModel(value);
                        }
                      }}
                      defaultValue={"relative"}
                    >
                      <Select.Option value="All">{t("all")}</Select.Option>
                      <Select.Option value={MODEL_TYPES.RELATIVE}>
                        {t("relative")}
                      </Select.Option>
                      <Select.Option value={MODEL_TYPES.RELATIVEWITHOURSP}>
                        {t("relativeWithoutAnalysis")}
                      </Select.Option>
                    </Select>
                  )}                  
                </div>
              </Flex>
            </Flex>
            <RelativeTable
              id={id}
              selectedRowKeys={selectedRowKeys}
              setSelectedRowKeys={setSelectedRowKeys}
              redirect={redirect}
              search={search}
              model={model}
              formType={formType}
              regNumber={regNumber}
              modelProps={modelProps}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default GeneralField;
