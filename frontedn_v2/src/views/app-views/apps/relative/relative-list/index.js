import React, { useEffect, useState, useCallback } from "react";
import { Card, Table, Select, Input, Button, message, Pagination } from "antd";
import {
  EyeOutlined,
  PlusCircleOutlined,
  EditOutlined,
  UpOutlined,
  DownOutlined,
  DeleteOutlined,
  LeftCircleOutlined,
  ClearOutlined,
  SearchOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import { useNavigate } from "react-router-dom";
// ...existing code...
import { getDateDayString, getDateString } from "utils/aditionalFunctions";
import RelativeService from "services/RelativeService";
import { Form, Row, Col } from "antd";
import { useTranslation } from "react-i18next";
import ProviderComponent from "providerComponent";
import Modal from "antd/es/modal/Modal";
import { Tooltip } from "antd";
import { MODEL_TYPES, SESSION_TYPES } from "utils/sessions";

const fields = [
  "regNumber",
  "lastName",
  "firstName",
  "fatherName",
  "form_reg",
  "birthDate",
  "birthPlace",
  "workPlace",
];

const RelativeList = () => {
  console.log("RelativeList render");
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState({});
  const [selectedRows, setSelectedRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expand, setExpand] = useState(false);
  const [form] = Form.useForm();
  const [modalDeleteVisible, setModalDeleteVisible] = useState(false);
  const [deleteRowId, setDeleteRowId] = useState(null);
  const [sortField, setSortField] = useState(null);
  const [sortOrder, setSortOrder] = useState(null);
  const { t } = useTranslation();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const sortParam = sortField && sortOrder
        ? { [sortField]: sortOrder.toLowerCase() }
        : undefined;
      const res = await RelativeService.getList(pageNumber, pageSize, search, sortParam);
      setList(res?.data?.relatives);
      setTotal(res?.data?.total_relatives);
    } catch (error) {
      setList([]);
      setTotal(0);
      message.error(t("data_not_found"));
    } finally {
      setLoading(false);
    }
  }, [pageNumber, pageSize, search, sortField, sortOrder, t]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const deleteRow = async (data) => {
    if (selectedRows.length > 1) {
      try {
        for (const row of selectedRows) {
          await RelativeService.delete(row?.id);
        }
      } catch (error) {
        if (error.response.data.code === 434) {
          message.error(t("you_can_only_delete_registration4_type_records"));
        } else {
          message.error(t("error_deleting_data"));
        }
      } finally {
        fetchData();
        setSelectedRows([]);
      }
    } else {
      try {
        await RelativeService.delete(data);
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

  const backHandle = () => {
    navigate(-1);
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
    const items = [
      {
        key: "add-card",
        label: (
          <Flex alignItems="center">
            <PlusCircleOutlined />
            <span className="ml-2">{t("add_card")}</span>
          </Flex>
        ),
        onClick: () => createSessionFunction(row?.id, SESSION_TYPES.SESSION, MODEL_TYPES.RELATIVE)
      },
      {
        key: "add-reserve",
        label: (
          <Flex alignItems="center">
            <PlusCircleOutlined />
            <span className="ml-2">{t("add_reserve")}</span>
          </Flex>
        ),
        onClick: () => createSessionFunction(row?.id, SESSION_TYPES.RESERVE, MODEL_TYPES.RELATIVE)
      },
      {
        key: "add-conclusion",
        label: (
          <Flex alignItems="center">
            <PlusCircleOutlined />
            <span className="ml-2">{t("add_conclusion")}</span>
          </Flex>
        ),
        onClick: () => createSessionFunction(row?.id, SESSION_TYPES.RAPORT, MODEL_TYPES.RELATIVE)
      },
      {
        key: "view-details",
        label: (
          <Flex alignItems="center">
            <EyeOutlined />
            <span className="ml-2">{t("view_details")}</span>
          </Flex>
        ),
        onClick: () => viewDetails(row)
      },
      {
        key: "edit",
        label: (
          <Flex alignItems="center">
            <EditOutlined />
            <span className="ml-2">{t("edit")}</span>
          </Flex>
        ),
        onClick: () => editRelative(row)
      }
    ];

    // Add delete item if user has permission
    if (hasDeletePermission) {
      items.push({
        key: "delete",
        label: (
          <Flex alignItems="center">
            <DeleteOutlined />
            <span className="ml-2">{t("delete")}</span>
          </Flex>
        ),
        onClick: () => {
          setDeleteRowId(row?.id);
          setModalDeleteVisible(true);
        }
      });
    }

    return { items };
  };

  const viewDetails = (row) => {
    navigate(
      `/app/apps/relative/info-relative/${row.id}`
    );
  };

  const editRelative = (row) => {
    navigate(
      `/app/apps/relative/edit-relative/${row.id}`
    );
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
      title: t("№"),
      dataIndex: "number",
      render: (text, record, index) => (
        <span>{(total - ((pageNumber - 1) * pageSize + index))}</span>
      ),
    },
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
      title: t("full_name"),
      dataIndex: "fullName",
      width: "15%",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder: sortField === "fullName" ? (sortOrder === "ASC" ? "ascend" : "descend") : null,
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
      title: t("registration_number"),
      dataIndex: "regNumber",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder: sortField === "regNumber" ? (sortOrder === "ASC" ? "ascend" : "descend") : null,
    },
    {
      title: t("registration_degree"),
      dataIndex: "relationDegree",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder: sortField === "relationDegree" ? (sortOrder === "ASC" ? "ascend" : "descend") : null,
    },
    {
      title: t("birth_date"),
      dataIndex: "birthDate",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder: sortField === "birthDate" ? (sortOrder === "ASC" ? "ascend" : "descend") : null,
      render: (birthDate, elm) => {
        if (birthDate) {
          return getDateDayString(birthDate);
        }
        return elm?.birthYear;
      },
    },
    {
      title: t("birthplace"),
      dataIndex: "birthPlace",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder: sortField === "birthPlace" ? (sortOrder === "ASC" ? "ascend" : "descend") : null,
    },
    {
      title: t("residence"),
      dataIndex: "residence",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder: sortField === "residence" ? (sortOrder === "ASC" ? "ascend" : "descend") : null,
      render: (residence) => {
        const text = residence || "";
        // If the text is longer than 10 characters, truncate it.
        const truncated = text.length > 20 ? text.slice(0, 20) + "..." : text;

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
      title: t("note"),
      dataIndex: "notes",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder: sortField === "notes" ? (sortOrder === "ASC" ? "ascend" : "descend") : null,
      render: (notes) => {
        const displayText = notes || "";
        const isLong = displayText.length > 50;
        const truncatedText = isLong ? displayText.substring(0, 50) + "..." : displayText;
        
        return (
          <span>{truncatedText}</span>
        );
      }
    },
    {
      title: t("updated_at"),
      dataIndex: "updatedAt",
      width: "15%",
      sorter: true,
      sortDirections: ["ascend", "descend"],
      sortOrder: sortField === "updatedAt" ? (sortOrder === "ASC" ? "ascend" : "descend") : null,
      render: (updatedAt) => (
        <>{updatedAt ? getDateString(updatedAt) : t("unknown")}</>
      ),
    }
  ];

  return (
    <Card>
      <Modal
        title={t("delete_relative")}
        open={modalDeleteVisible}
        okText={t("delete")}
        cancelText={t("cancel")}
        okButtonProps={{
          danger: true,
        }}
        onCancel={() => setModalDeleteVisible(false)}
        onOk={() => handleDelete()}
      >
        <p>{t("delete_relative_message")}</p>
      </Modal>
      <Flex
        alignItems="center"
        justifyContent="space-between"
        mobileFlex={false}
      >
        <Flex className="mb-1" mobileFlex={false}>
          <div className="mr-md-3 mb-3">
            <Select
              placeholder={t("select_option")}
              className="mr-2"
              style={{ width: "216px" }}
              onChange={(value) => {
                if (value === "All") {
                  setSearch({ ...search, model: "" });
                } else {
                  setSearch({ ...search, model: value });
                }
              }}
              defaultValue={"relative"}
            >
              <Select.Option value="All">{t("all")}</Select.Option>
              <Select.Option value="relative">{t("relative")}</Select.Option>
              <Select.Option value="relativeWithoutAnalysis">
                {t("relativeWithoutAnalysis")}
              </Select.Option>
            </Select>
            {/* <Input placeholder="Search" prefix={<SearchOutlined />} onChange={e => onSearch(e)}/> */}
          </div>
        </Flex>
        <Flex className="mb-1">
          <div className="md-3 mb-3 d-flex gap-2">
            <Button onClick={backHandle}><LeftCircleOutlined /> {t("back")}</Button>
          </div>
        </Flex>
      </Flex>
      <Form
        form={form}
        name="advanced_search"
        className="ant-advanced-search-form"
        onFinish={(values) => console.log("Received values of form: ", values)}
      >
        {/* <div style={{ marginBottom: '16px', fontWeight: 'bold' }}>Search system:</div> */}
        <Row gutter={8} style={{ marginBottom: "-10px" }}>
          {Array.from({ length: expand ? 8 : 4 }).map((_, i) => (
            <Col span={6} key={i}>
              <Form.Item name={`field-${i}`} label={null}>
                <Input
                  prefix={<SearchOutlined />}
                  key={i}
                  autoFocus={i === 0}
                  tabIndex={i + 1}
                  placeholder={
                    expand
                      ? i < 4
                        ? [
                          t("reg_number"),
                          t("last_name"),
                          t("first_name"),
                          t("father_name"),
                        ][i]
                        : [
                          t("form"),
                          t("birth_date"),
                          t("birth_place"),
                          t("work_place"),
                        ][i - 4]
                      : [
                        t("reg_number"),
                        t("last_name"),
                        t("first_name"),
                        t("father_name"),
                      ][i]
                  }
                  type={i === 5 ? "number" : "text"}
                  onChange={(e) =>
                    setSearch({ ...search, [fields[i]]: e.target.value })
                  }
                />
              </Form.Item>
            </Col>
          ))}
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
              onClick={() => {
                setSearch({ model: search?.model ?? "" });
                form.resetFields();
                setSortField(null);
                setSortOrder(null);
              }}
              tabIndex={9}
            >
              <ClearOutlined /> {t("clear")}
            </Button>
            <Button
              style={{ marginLeft: 8 }}
              // type="primary"
              // style={{ marginLeft: 8, fontSize: 12, padding: 0, height: "auto" }}
              tabIndex={10}
              onClick={() => setExpand(!expand)}
            >
              {expand ? <UpOutlined /> : <DownOutlined />} {t("more_search")}
            </Button>
          </Col>
        </Row>
      </Form>
      <div className="table-responsive">
        <Table
          columns={tableColumns}
          dataSource={list.map((elm) => ({
            ...elm,
            createdAt: getDateString(elm?.createdAt),
          }))}
          rowKey="id"
          loading={loading}
          // rowSelection={{
          //   selectedRowKeys: selectedRowKeys,
          //   type: "checkbox",
          //   preserveSelectedRowKeys: false,
          //   ...rowSelection,
          // }}
          pagination={false}
          onChange={handleTableChange}
        />
        <Row style={{ marginTop: 16, justifyContent: "space-between", alignItems: "center" }}>
          <Col>
            <span style={{ fontWeight: "bold" }}>{t("total_number_of_entries")}: {total}</span>
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

export default RelativeList;
