import React, { useEffect, useState } from "react";
import { Card, Table, Select, Tooltip, Modal } from "antd";
import Flex from "components/shared-components/Flex";
import utils from "utils";
import RegistrationService from "services/RegistrationService";
import { getDateDayString, getDateString } from "utils/aditionalFunctions";
import { useTranslation } from "react-i18next";

const { Option } = Select;

const LogList = ({ id }) => {
  const { t } = useTranslation();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [field, setField] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState("");
  const [modalTitle, setModalTitle] = useState("");

  const categories = [
    { key: "form_reg", label: t("form_registration") },
    { key: "regNumber", label: t("registration_number") },
    { key: "regDate", label: t("registration_date") },
    { key: "regEndDate", label: t("registration_end_date") },
    { key: "firstName", label: t("first_name") },
    { key: "lastName", label: t("last_name") },
    { key: "fatherName", label: t("father_name") },
    { key: "birthDate", label: t("birth_date") },
    { key: "birthYear", label: t("birth_year") },
    { key: "birthPlace", label: t("birth_place") },
    { key: "conclusionRegNum", label: t("conclusion_registration_number") },
    { key: "workplace", label: t("workplace") },
    { key: "position", label: t("position") },
    { key: "residence", label: t("residence") },
    { key: "notes", label: t("compr_info") },
    { key: "additionalNotes", label: t("additional_notes") },
    { key: "accessStatus", label: t("access_status") },
    { key: "expired", label: t("expired_date") },
    { key: "completeStatus", label: t("complete_status") },
    { key: "expiredDate", label: t("expired_date") },
    { key: "recordNumber", label: t("record_number") },
    { key: "externalNotes", label: t("moving") },
    { key: "or_tab", label: t("initiator") },
    { key: "executorId", label: t("executor") },
    { key: "model", label: t("model") },
    { key: "nationality", label: t("nationality") },
    { key: "pinfl", label: t("pinfl") },
    { key: "conclusion_compr", label: t("conclusion_compr") }
  ];

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await RegistrationService.getLogList({
          id,
          field,
          pageNumber,
          pageSize,
        });
        setList(response?.data?.logs);
        setTotal(response?.data?.totalCount);
      } catch (error) {
        console.log(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [field, pageNumber, pageSize, id]);

  const tableColumns = [
    {
      title: t("field_name"),
      dataIndex: "fieldName",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "fieldName"),
      render: (fieldName) => (
        <Tooltip title={fieldName}>
          <span>{categories.find(elm => elm.key === fieldName)?.label || fieldName}</span>
        </Tooltip>
      ),
    },
    {
      title: t("old_value"),
      dataIndex: "oldValue",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "oldValue"),
      render: (oldValue, record) => {
        // 1️⃣ Date fieldlar ro‘yxati
        const dateFields = ["regEndDate", "regDate", "expiredDate"];

        // 2️⃣ Agar date bo‘lsa → formatlab chiqaramiz
        if (dateFields.includes(record?.fieldName)) {
          return <div>{getDateDayString(oldValue)}</div>;
        }

        // 3️⃣ Oddiy text uchun umumiy logic
        const text = oldValue ?? "";
        const isLong = text.length > 50;
        const truncatedText = isLong ? text.slice(0, 50) + "..." : text;

        return (
          <span
            style={{
              cursor: isLong ? "pointer" : "default",
              color: isLong ? "#1890ff" : "inherit",
            }}
            onClick={() => {
              if (isLong) {
                setModalTitle(t("old_value"));
                setModalContent(text);
                setModalVisible(true);
              }
            }}
          >
            {truncatedText}
          </span>
        );
      },
    },
    {
      title: t("new_value"),
      dataIndex: "newValue",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "newValue"),
      render: (newValue, record) => {
        // Date fieldlar
        const dateFields = ["regEndDate", "regDate", "expiredDate"];

        // Agar date bo‘lsa → formatlab chiqaramiz
        if (dateFields.includes(record?.fieldName)) {
          return <div>{getDateDayString(newValue)}</div>;
        }

        // Text uchun umumiy logic
        const text = newValue ?? "";
        const isLong = text.length > 50;
        const truncatedText = isLong ? text.slice(0, 50) + "..." : text;

        return (
          <span
            style={{
              cursor: isLong ? "pointer" : "default",
              color: isLong ? "#1890ff" : "inherit",
            }}
            onClick={() => {
              if (isLong) {
                setModalTitle(t("new_value"));
                setModalContent(text);
                setModalVisible(true);
              }
            }}
          >
            {truncatedText}
          </span>
        );
      },
    },

    {
      title: t("executed_by"),
      dataIndex: "executor",
      render: (_, elm) => {
        const fullName = `${elm?.executor?.last_name ? elm?.executor?.last_name.slice(0, 1) + "." : ""} ${elm?.executor?.first_name ? elm?.executor?.first_name.slice(0, 20) : ""}`;
        return (
          <Tooltip title={fullName}>
            <span>{fullName}</span>
          </Tooltip>
        );
      },
      // sorter: (a, b) => utils.antdTableSorter(a, b, "executor"),
    },
    {
      title: t("created_at"),
      dataIndex: "createdAt",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "createdAt"),
      render: (createdAt) => <div>{getDateString(createdAt)}</div>,
    },
  ];
  const handleShowCategory = (value) => {
    if (value !== "all") {
      setField(value);
    } else {
      setField("");
    }
  };

  return (
    <Card>
      <Flex
        alignItems="center"
        justifyContent="space-between"
        mobileFlex={false}
      >
        <Flex className="mb-1" mobileFlex={false}>
          {/* <div className="mr-md-3 mb-3">
						<Input placeholder="Search" prefix={<SearchOutlined />} onChange={e => onSearch(e)}/>
					</div> */}
          <div className="mb-3">
            <Select
              defaultValue="All"
              className="w-100"
              style={{ minWidth: 180 }}
              onChange={handleShowCategory}
              placeholder={t("category")}
            >
              <Option value="all">{t("all")}</Option>
              {categories.map((elm) => (
                <Option key={elm.key} value={elm.key}>
                  {elm.label}
                </Option>
              ))}
            </Select>
          </div>
        </Flex>
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
      <Modal
        title={modalTitle}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={800}
        style={{ top: 20 }}
      >
        <div
          style={{
            maxHeight: "70vh",
            overflowY: "auto",
            wordBreak: "break-word",
            whiteSpace: "pre-wrap",
            padding: "10px 0"
          }}
        >
          {modalContent}
        </div>
      </Modal>
    </Card>
  );
};

export default LogList;
