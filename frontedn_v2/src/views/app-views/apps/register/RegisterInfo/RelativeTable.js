import { Table, message, Row, Col, Pagination, Modal, Tooltip } from "antd";
import React, { useState, useEffect, useCallback } from "react";
import {
  EyeOutlined,
  PlusCircleOutlined,
  UnorderedListOutlined,
  EditOutlined,
  CopyOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import RelativeService from "services/RelativeService";
import RegistrationService from "services/RegistrationService";
import { useTranslation } from "react-i18next";
import { getDateDayString } from "utils/aditionalFunctions";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import createSession, { MODEL_TYPES, SESSION_TYPES } from "utils/sessions";
import ProviderComponent from "providerComponent";

const RelativeTable = ({
  id,
  model,
  formType,
  regNumber,
  selectedRowKeys,
  setSelectedRowKeys,
  modelProps,
}) => {
  const { t } = useTranslation();
  const [deleteRowId, setDeleteRowId] = useState(null);
  const [modalDeleteVisible, setModalDeleteVisible] = useState(false);
  const [data, setData] = useState({
    items: [],
    loading: true,
    pageNumber: 1,
    pageSize: 10,
    total: 0,
  });
  const [sortedColumns, setSortedColumns] = useState([]);
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    try {
      setData((prev) => ({ ...prev, loading: true }));
      const sort = sortedColumns.length > 0
        ? sortedColumns.map(s => ({ [s.field]: s.order.toLowerCase() }))
        : [{ lastName: "asc" }];
      let response;
      if (modelProps === "registration4") {
        response = await RegistrationService.getList(
          data.pageNumber,
          data.pageSize,
          "registration4",
          { regNumber },
          { sort }
        );
      } else {
        response = await RelativeService.list_by_registrationId(
          data.pageNumber,
          data.pageSize,
          id,
          model,
          { params: { id, model }, sort }
        );
      }
      setData({
        items: response?.data?.relatives || response?.data?.registrations || [],
        loading: false,
        pageNumber: data.pageNumber,
        pageSize: data.pageSize,
        total:
          response?.data?.total_relatives ||
          response?.data?.total_registrations ||
          0,
      });
    } catch (error) {
      setData({
        items: [],
        loading: false,
        pageNumber: 1,
        pageSize: 10,
        total: 0,
      });
    }
  }, [id, model, regNumber, data.pageNumber, data.pageSize, modelProps, sortedColumns]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addCard = (row, type) => {
    if (selectedRowKeys.length > 0) {
      selectedRowKeys.forEach((key) => {
        createSession(key, type);
      });
      setSelectedRowKeys([]);
    } else {
      createSession(row?.id, type);
    }
  };

  const viewDetails = (row) => {
    if (row?.model !== MODEL_TYPES.REGISTRATION4) {
      navigate(
        `/app/apps/relative/info-relative/${row?.id}?model=${MODEL_TYPES.RELATIVE}`
      );
    } else {
      navigate(
        `/app/apps/register/info-register/${row?.id}?model=${MODEL_TYPES.REGISTRATION4}`
      );
    }
  };

  const editRelative = (row) => {
    if (row?.model === MODEL_TYPES.REGISTRATION4) {
      navigate(`/app/apps/register/edit-register/${row?.id}?model=${MODEL_TYPES.REGISTRATION4}`);
    } else {
      navigate(`/app/apps/relative/edit-relative/${row?.id}?model=${MODEL_TYPES.RELATIVE}`);
    }
  };

  const duplicateRelative = async (row) => {
    try {
      await RelativeService.duplicate(row?.id);
      message.success(t("duplicate_success"));
    } catch (error) {
      message.error(t("duplicate_error"));
    } finally {
      fetchData();
    }
  };

  const dropdownMenu = (row, hasDeletePermission, modelProps) => {
    const items = [
      {
        key: "add-main",
        label: (
          <Flex alignItems="center">
            <PlusCircleOutlined />
            <span className="ml-2">
              {t("add_main")}
              {selectedRowKeys.length > 0 && (
                <span className="ml-2">({selectedRowKeys.length})</span>
              )}
            </span>
          </Flex>
        ),
        onClick: () => addCard(row, SESSION_TYPES.SESSION),
      },
      {
        key: "add-reserve",
        label: (
          <Flex alignItems="center">
            <PlusCircleOutlined />
            <span className="ml-2">
              {t("add_reserve")}
              {selectedRowKeys.length > 0 && (
                <span className="ml-2">({selectedRowKeys.length})</span>
              )}
            </span>
          </Flex>
        ),
        onClick: () => addCard(row, SESSION_TYPES.RESERVE),
      },
      {
        key: "add-conclusion",
        label: (
          <Flex alignItems="center">
            <PlusCircleOutlined />
            <span className="ml-2">
              {t("add_conclusion")}
              {selectedRowKeys.length > 0 && (
                <span className="ml-2">({selectedRowKeys.length})</span>
              )}
            </span>
          </Flex>
        ),
        onClick: () => addCard(row, SESSION_TYPES.RAPORT),
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
        onClick: () => editRelative(row),
      },
      {
        key: "duplicate",
        label: (
          <Flex alignItems="center">
            <CopyOutlined />
            <span className="ml-2">{t("duplicate")}</span>
          </Flex>
        ),
        onClick: () => duplicateRelative(row),
      },
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
          setDeleteRowId({ id: row?.id, model: modelProps });
          setModalDeleteVisible(true);
        },
      });
    }

    return { items };
  };

  const handleTableChange = (pagination, filters, sorter) => {
    const sorters = Array.isArray(sorter) ? sorter : [sorter];
    const newSorted = sorters
      .filter(s => s.order)
      .map(s => ({ field: s.field, order: s.order === 'ascend' ? 'ASC' : 'DESC' }));
    setSortedColumns(newSorted);
  };

  const columns = [
    ...(modelProps !== "registration4"
      ? [
        {
          title: t("relation_degree"),
          dataIndex: "relationDegree",
          key: "relation_degree",
          sorter: { multiple: 1 },
          sortDirections: ["ascend", "descend"],
          sortOrder: (() => { const f = sortedColumns.find(s => s.field === "relationDegree"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
          render: (text) =>
            text?.length > 30 ? text.slice(0, 30) + "..." : text,
        },
      ]
      : []),
    {
      title: t("last_name"),
      dataIndex: "lastName",
      key: "last_name",
      sorter: { multiple: 2 },
      sortDirections: ["ascend", "descend"],
      sortOrder: (() => { const f = sortedColumns.find(s => s.field === "lastName"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
      render: (text) => (text?.length > 30 ? text.slice(0, 30) + "..." : text),
    },
    {
      title: t("first_name"),
      dataIndex: "firstName",
      key: "first_name",
      sorter: { multiple: 3 },
      sortDirections: ["ascend", "descend"],
      sortOrder: (() => { const f = sortedColumns.find(s => s.field === "firstName"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
      render: (text) => (text?.length > 30 ? text.slice(0, 30) + "..." : text),
    },
    {
      title: t("father_name"),
      dataIndex: "fatherName",
      key: "fatherName",
      sorter: { multiple: 4 },
      sortDirections: ["ascend", "descend"],
      sortOrder: (() => { const f = sortedColumns.find(s => s.field === "fatherName"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
      render: (text) => (text?.length > 30 ? text.slice(0, 30) + "..." : text),
    },
    {
      title: t("birth_date"),
      dataIndex: "birthDate",
      key: "birthDate",
      sorter: { multiple: 5 },
      sortDirections: ["ascend", "descend"],
      sortOrder: (() => { const f = sortedColumns.find(s => s.field === "birthDate"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
      render: (text, elm) =>
        elm?.birthDate ? getDateDayString(elm.birthDate) : elm?.birthYear || "",
    },
    ...(modelProps === "registration4"
      ? [
        {
          title: t("regEndDate"),
          dataIndex: "regEndDate",
          key: "regEndDate",
          render: (regEndDate) => (
            <Tooltip title={getDateDayString(regEndDate)}>
            <span>
              {regEndDate ? (
                getDateDayString(regEndDate)?.length > 10 ? (
                  getDateDayString(regEndDate)?.slice(0, 10) + "..."
                ) : (
                  getDateDayString(regEndDate)
                )
              ) : (
                <></>
              )}
            </span>
          </Tooltip>
          )
        },
      ]
      : []),
    {
      title: t("birth_place"),
      dataIndex: "birthPlace",
      key: "birthPlace",
      sorter: { multiple: 6 },
      sortDirections: ["ascend", "descend"],
      sortOrder: (() => { const f = sortedColumns.find(s => s.field === "birthPlace"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
      render: (text) => (text?.length > 30 ? text.slice(0, 30) + "..." : text),
    },
    {
      title: t("residence"),
      dataIndex: "residence",
      key: "residence",
      sorter: { multiple: 7 },
      sortDirections: ["ascend", "descend"],
      sortOrder: (() => { const f = sortedColumns.find(s => s.field === "residence"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
      render: (text) =>
        text?.length > 100 ? text.slice(0, 100) + "..." : text,
    },
    {
      title: t("workplace"),
      dataIndex: "workplace",
      key: "workplace",
      sorter: { multiple: 8 },
      sortDirections: ["ascend", "descend"],
      sortOrder: (() => { const f = sortedColumns.find(s => s.field === "workplace"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
      render: (text, elm) =>
        elm?.workplace
          ? elm?.workplace + (elm?.position ? " - " + elm?.position : "")
          : elm?.position || "",
    },
    {
      title: t("compr_info"),
      dataIndex: "notes",
      key: "notes",
      sorter: { multiple: 9 },
      sortDirections: ["ascend", "descend"],
      sortOrder: (() => { const f = sortedColumns.find(s => s.field === "notes"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
      render: (text) => (text?.length > 10 ? text.slice(0, 10) + "..." : text),
    },
    {
      title: <UnorderedListOutlined />,
      dataIndex: "actions",
      render: (_, elm) => (
        <div className="text-right">
          <ProviderComponent rolePermission={["superAdmin"]}>
            {(hasPermission) => (
              <EllipsisDropdown
                menu={dropdownMenu(elm, hasPermission, elm?.model)}
              />
            )}
          </ProviderComponent>
        </div>
      ),
    },
  ];

  const deleteRow = async (data) => {
    try {
      if (data.model === MODEL_TYPES.RELATIVE) {
        await RelativeService.delete(data?.id);
      } else {
        await RegistrationService.delete(data?.id);
      }
      fetchData();
    } catch (error) {
      message.error(t("error_deleting_data_relatives"));
    }
  };

  const handleDelete = async () => {
    deleteRow(deleteRowId);
    setModalDeleteVisible(false);
  };

  return (
    <>
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
      <Table
        dataSource={data.items}
        columns={columns}
        rowKey="id"
        rowSelection={{
          selectedRowKeys,
          type: "checkbox",
          preserveSelectedRowKeys: false,
          onChange: setSelectedRowKeys,
        }}
        loading={data.loading}
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
            {t("total_number_of_entries")}: {data.total}
          </span>
        </Col>
        <Col>
          <Pagination
            current={data.pageNumber}
            pageSize={data.pageSize}
            total={data.total}
            showSizeChanger
            pageSizeOptions={["10", "20", "50", "100"]}
            onShowSizeChange={(current, size) => {
              setData((prev) => ({ ...prev, pageSize: size, pageNumber: 1 }));
            }}
            onChange={(page, pageSize) => {
              setData((prev) => ({ ...prev, pageNumber: page, pageSize }));
            }}
          />
        </Col>
      </Row>
    </>
  );
};

export default RelativeTable;
