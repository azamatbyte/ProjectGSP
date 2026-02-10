import React, { useEffect, useState, useContext, useMemo, useCallback } from "react";
import {
  Card,
  Table,
  Select,
  Button,
  message,
  Modal,
  Row,
  Col,
  Typography,
} from "antd";
import {
  EyeOutlined,
  DeleteOutlined,
  PlusCircleOutlined,
  EditOutlined,
  UserAddOutlined,
  FileExcelOutlined,
  LeftCircleOutlined,
  ClearOutlined,
  HolderOutlined,
  UnorderedListOutlined
} from "@ant-design/icons";
import { DndContext } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import { useNavigate } from "react-router-dom";
import { getDateDayString, getDateString } from "utils/aditionalFunctions";
import ProviderComponent from "providerComponent";
import { useTranslation } from "react-i18next";
import RaportService from "services/RaportService";
import RegistrationFourService from "services/RegistartionFourService";
import SessionService from "services/SessionService"; // You'll need to create this service
import { MODEL_TYPES, SESSION_TYPES } from "utils/sessions";
import SignedListService from "services/SignedListService";
import { debounce } from "lodash";
import { Tooltip } from "antd";
const { Option } = Select;

// Create Row Context for drag handle
const RowContext = React.createContext({});

// Drag Handle Component
const DragHandle = () => {
  const { setActivatorNodeRef, listeners } = useContext(RowContext);
  return (
    <Button
      type="text"
      size="small"
      icon={<HolderOutlined />}
      style={{ cursor: "move" }}
      ref={setActivatorNodeRef}
      {...listeners}
    />
  );
};

// Sortable Row Component
const RowTable = (props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props["data-row-key"],
  });

  const style = {
    ...props.style,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { position: "relative", zIndex: 9999 } : {}),
  };

  const contextValue = useMemo(
    () => ({ setActivatorNodeRef, listeners }),
    [setActivatorNodeRef, listeners]
  );

  return (
    <RowContext.Provider value={contextValue}>
      <tr {...props} ref={setNodeRef} style={style} {...attributes} />
    </RowContext.Provider>
  );
};

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

const CartList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [isModalVisibleMalumotnoma, setIsModalVisibleMalumotnoma] = useState(false);
  const [malumotnomaRaport, setMalumotnomaRaport] = useState(null);
  const [malumotnomaRaports] = useState([
    { key: "type8", label: t("bad_malumotnoma") },
    { key: "type9", label: t("good_malumotnoma") },
  ]);
  const [isModalVisibleSpecialAnalysis, setIsModalVisibleSpecialAnalysis] = useState({
    visible: false,
    type: null,
  });
  const [selectedValues, setSelectedValues] = useState([]);
  const [signedListOptions, setSignedListOptions] = useState([]);
  const [signedListFetching, setSignedListFetching] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await SessionService.listSessions(
        pageNumber,
        pageSize,
        SESSION_TYPES.RAPORT
      );

      if (response.status === 200) {
        setList(response.data.sessions || []);
        setTotal(response.data.total_sessions || 0);
      }
    } catch (error) {
      setList([]);
      setTotal(0);
      message.error(t("data_not_found"));
    } finally {
      setLoading(false);
    }
  }, [pageNumber, pageSize, t]);

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

  // Drag and Drop Handler
  const onDragEnd = async ({ active, over }) => {
    if (active.id !== over?.id) {
      const activeIndex = list.findIndex((record) => record.id === active.id);
      const overIndex = list.findIndex((record) => record.id === over?.id);

      // Update local state immediately for smooth UX
      const newList = arrayMove(list, activeIndex, overIndex);
      setList(newList);

      try {
        // Update backend with new order
        await SessionService.swapSessions(SESSION_TYPES.RAPORT, activeIndex, overIndex);

        // Refresh data to ensure consistency
        await fetchData();
      } catch (error) {
        console.error("Error updating session order:", error);
        message.error(t("error_updating_order"));
        // Revert local state on error
        setList(list);
      }
    }
  };

  const dropdownMenu = (row) => {
    const items = [
      {
        key: "delete",
        label: (
          <Flex alignItems="center">
            <DeleteOutlined />
            <span className="ml-2">
              {t("delete") +
                " " +
                (selectedRowKeys?.length > 0
                  ? "(" + selectedRowKeys?.length + ")"
                  : "")}
            </span>
          </Flex>
        ),
        onClick: () => deleteRecord(row)
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
        onClick: () => editRegistration(row)
      }
    ];

    // Add relative item conditionally
    if (row?.model === "registration") {
      items.push({
        key: "add-relative",
        label: (
          <Flex alignItems="center">
            <UserAddOutlined />
            <span className="ml-2">{t("add_new_relative")}</span>
          </Flex>
        ),
        onClick: () => addRelative(row)
      });
    }

    return { items };
  };

  const goToSearch = () => {
    navigate("/app/search-list");
  };

  const editRegistration = (row) => {
    if (row?.model === MODEL_TYPES.REGISTRATION || row?.model === MODEL_TYPES.REGISTRATION4) {
      navigate(
        `/app/apps/register/edit-register/${row.registrationId}?model=${row.model}`
      );
    } else {
      navigate(
        `/app/apps/relative/edit-relative/${row.registrationId}?model=${row.model}`
      );
    }
  };

  const viewDetails = (row) => {
    if (row?.model === MODEL_TYPES.REGISTRATION || row?.model === MODEL_TYPES.REGISTRATION4) {
      navigate(
        `/app/apps/register/info-register/${row.registrationId}?model=${row.model}`
      );
    } else {
      navigate(
        `/app/apps/relative/info-relative/${row.registrationId}?model=${row.model}`
      );
    }
  };

  const addRelative = (row) => {
    if (row?.model === "registration") {
      navigate(
        `/app/apps/relative/add-relative/${row.registrationId}`
      );
    }
  };

  const deleteRecord = async (row) => {
    try {
      if (selectedRowKeys.length > 1) {
        // Delete multiple sessions with detailed progress
        const totalSessions = selectedRowKeys.length;
        const results = [];

        // Show initial progress message
        message.loading(`${t("starting_deletion")}: 0/${totalSessions}`, 0);

        for (let i = 0; i < selectedRowKeys.length; i++) {
          const sessionId = selectedRowKeys[i];

          try {
            await SessionService.deleteSession(sessionId);
            results.push({ sessionId, success: true });

            // Update progress
            message.loading(`${t("deleting_progress")}: ${i + 1}/${totalSessions}`, 0);

            // Small delay to prevent overwhelming the server
            if (i < selectedRowKeys.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }

          } catch (error) {
            console.error(`Error deleting session ${sessionId}:`, error);
            results.push({ sessionId, success: false, error });
          }
        }

        // Destroy loading message and show final result
        message.destroy();

        const successResults = results.filter(r => r.success);
        const failedResults = results.filter(r => !r.success);

        if (failedResults.length === 0) {
          message.success(`${t("all_sessions_deleted_successfully")}: ${successResults.length}`);
        } else if (successResults.length > 0) {
          message.warning(
            `${t("partial_deletion_complete")}: ${successResults.length} ${t("deleted")}, ${failedResults.length} ${t("failed")}`
          );
        } else {
          message.error(`${t("all_deletions_failed")}: ${failedResults.length}`);
        }

      } else {
        // Delete single session
        message.loading(t("deleting_session"), 0);
        await SessionService.deleteSession(row.id);
        message.destroy();
        message.success(t("session_deleted_successfully"));
      }

      setSelectedRowKeys([]);
      await fetchData();

    } catch (error) {
      message.destroy(); // Clean up any loading messages
      console.error("Error deleting session:", error);
      message.error(t("error_deleting_session"));
    } finally {
      setSelectedRowKeys([]);
      setSelectedValues([]);
      setIsModalVisibleMalumotnoma(false);
    }
  };

  const backHandle = () => {
    navigate(-1);
  };

  const clearHandle = async () => {
    try {
      // Get all sessions for current type and delete them
      const response = await SessionService.clear(SESSION_TYPES.RAPORT);
      if (response.data.code === 200) {
        message.success(t("success"));
      }
    } catch (error) {
      console.error("Error clearing sessions:", error);
      message.error(t("error_clearing_sessions"));
    } finally {
      fetchData();
    }
  };

  const sverka = async () => {
    try {
      const response = await RegistrationFourService.exportMainSverka({
        type: SESSION_TYPES.RAPORT,
      });
      if (response?.status === 200) {
        const a = document.createElement("a");
        a.href = (
          response?.data?.link +
          "?newFileName=Сверка"
        ).trim();
        a.setAttribute("download", "Сверка.xlsx");
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (error) {
      console.log("error", error);
      message.error(t("error_fetching_d"));
    }
  };

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

  const handleExportRelativesSP = async (type, signListIds) => {
    const ids = [];
    if (selectedRowKeys.length > 0) {
      selectedRowKeys?.forEach((sessionId) => {
        const session = list.find((s) => s.id === sessionId);
        if (session) {
          ids.push(session.registrationId);
        }
      });
    }

    try {
      const response = await RaportService.createRelativeList({
        ids,
        type: SESSION_TYPES.RAPORT,
        signListIds,
      });
      const link = response?.data?.link;
      const a = document.createElement("a");
      a.href = link + "?newFileName=Отчеты";
      a.setAttribute("download", "Отчеты");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error exporting relatives:", error);
      message.error(t("error_exporting_relatives"));
      setSelectedRowKeys([]);
      setSelectedValues([]);
      setIsModalVisibleSpecialAnalysis((prevState) => ({ ...prevState, visible: false }));
    } finally {
      setSelectedRowKeys([]);
      setSelectedValues([]);
      setIsModalVisibleSpecialAnalysis((prevState) => ({ ...prevState, visible: false }));
    }
  };

  const generateReport = async (name, selectedValues) => {
    try {
      let response;
      let regNumbers = [];
      if (selectedRowKeys.length) {
        response = await RaportService.create({
          ids: selectedRowKeys.map((selectedId) =>
            list.find(item => item.id === selectedId)?.registrationId || null
          ).filter(id => id !== null),
          type: SESSION_TYPES.RAPORT,
          name: name,
          signListIds: selectedValues,
        });
        regNumbers = selectedRowKeys.map((selectedId) =>
          list.find(item => item.id === selectedId)?.regNumber || null
        ).filter(regNumber => regNumber !== null);
        // Remove duplicates while preserving order
        const uniqueRegNumbers = Array.from(new Set(regNumbers));
        console.log(regNumbers);
      } else {
        response = await RaportService.create({
          ids: [],
          type: SESSION_TYPES.RAPORT,
          name: name,
          signListIds: selectedValues,
        });
      }
      const fileName = regNumbers && regNumbers.length > 0
        ? `Заключение (${Array.from(new Set(regNumbers)).join(', ')})`
        : "Заключение";
      if (response?.status === 200) {
        const a = document.createElement("a");
        a.href = (
          response?.data?.link +
          `?newFileName=${encodeURIComponent(fileName)}`
        ).trim();
        a.setAttribute("download", `${fileName}.xlsx`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Error generating report:", error);
      message.error(t("error_generating_report"));
      setSelectedRowKeys([]);
      setSelectedValues([]);
      setIsModalVisibleSpecialAnalysis((prevState) => ({ ...prevState, visible: false }));
    } finally {
      setSelectedRowKeys([]);
      setSelectedValues([]);
      setIsModalVisibleSpecialAnalysis((prevState) => ({ ...prevState, visible: false }));
    }
  };

  const tableColumns = [
    {
      key: "sort",
      align: "center",
      width: 80,
      render: () => <DragHandle />,
    },
    {
      title: t("order"),
      dataIndex: "order",
      width: 80,
      render: (order) => <span>{order}</span>,
    },
    {
      title: t("registration_number"),
      dataIndex: "regNumber",
    },
    {
      title: t("model"),
      dataIndex: "model",
      render: (model) => (
        <>
          {model === "registration"
            ? t("registration")
            : model === "relative"
              ? t("relative")
              : model === "registration4"
                ? t("registration4")
                : model === "relativeWithoutAnalysis"
                  ? t("relativeWithoutAnalysis")
                  : model}
        </>
      ),
    },
    {
      title: t("full_name"),
      dataIndex: "fullName",
      width: "15%",
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
      title: t("birth_date"),
      dataIndex: "birthDate",
      render: (_, elm) => (
        <>
          {elm?.birthDate ? getDateDayString(elm?.birthDate) : elm?.birthYear}
        </>
      ),
    },
    {
      title: t("birth_place"),
      dataIndex: "birthPlace",
      render: (birth_place) => (
        <Tooltip title={birth_place}>
          <span style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          >
            {birth_place ? (
              birth_place?.length > 50 ? (
                birth_place?.slice(0, 50) + "..."
              ) : (
                birth_place
              )
            ) : (
              <></>
            )}
          </span>
        </Tooltip>
      ),
    },
    {
      title: t("work_place"),
      dataIndex: "workplace",
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
      render: (residence) => (
        <Tooltip title={residence}>
          <span style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          >
            {residence ? (
              residence?.length > 50 ? (
                residence?.slice(0, 50) + "..."
              ) : (
                residence
              )
            ) : (
              <></>
            )}
          </span>
        </Tooltip>
      ),
    },
    {
      title: t("compr_info"),
      dataIndex: "notes",
      render: (notes) => (
        <Tooltip title={notes}>
          <span style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          >
            {notes ? (
              notes?.length > 50 ? (
                notes?.slice(0, 50) + "..."
              ) : (
                notes
              )
            ) : (
              <></>
            )}
          </span>
        </Tooltip>
      ),
    },
    {
      title: t("additional_compr_info"),
      dataIndex: "additionalNotes",
      render: (additionalNotes) => (
        <Tooltip title={additionalNotes}>
          <span style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          >
            {additionalNotes ? (
              additionalNotes?.length > 50 ? (
                additionalNotes?.slice(0, 50) + "..."
              ) : (
                additionalNotes
              )
            ) : (
              <></>
            )}
          </span>
        </Tooltip>
      ),
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

  const handleSignedListChange = (values) => {
    // Preserve strictly the chronological order in which items were selected.
    // 1. Keep prior selected values that are still present (in their old order)
    // 2. Append any newly selected values (those not in previous state yet) at the end
    setSelectedValues(prev => {
      if (!Array.isArray(values)) return [];
      const prevSet = new Set(prev);
      const stillExisting = prev.filter(v => values.includes(v));
      const newlyAdded = values.filter(v => !prevSet.has(v));
      return [...stillExisting, ...newlyAdded];
    });
  };

  const generateReportMalumotnoma = async (name) => {
    try {
      const response = await RaportService.exportSpecialMalumotnomaList({
        type: SESSION_TYPES.RAPORT,
        ids: selectedRowKeys.map((selectedId) =>
          list.find(item => item.id === selectedId)?.registrationId || null
        ).filter(id => id !== null),
        name: name,
        code: name,
        signListIds: selectedValues,
      });
      const filename = "МАЛУМОТНОМА";
      const link = document.createElement("a");
      link.href = response?.data?.link + "?newFileName=" + filename;
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

  const rowSelection = {
    onChange: (key, rows) => {
      setSelectedRowKeys(key);
    },
  };

  return (
    <Card style={{ width: "100%" }}>
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
        title={isModalVisibleSpecialAnalysis?.type === "export_special_analysis" ? t("export_special_analysis") : t("generate_report")}
        open={isModalVisibleSpecialAnalysis?.visible}
        footer={null}
        onCancel={() =>
          setIsModalVisibleSpecialAnalysis((prevState) => ({
            ...prevState,
            visible: false,
          }))
        }
      >
        <Typography.Text
          style={{ width: "100%", cursor: "pointer", marginBottom: "10px" }}
          onClick={() => {
            console.log(selectedValues);
          }}
        >
          {isModalVisibleSpecialAnalysis?.type === "export_special_analysis" ? t("export_special_analysis") : t("generate_report")}
        </Typography.Text>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <Button
            onClick={() =>
              setIsModalVisibleSpecialAnalysis((prevState) => ({
                ...prevState,
                visible: false,
              }))
            }
          >
            {t("cancel")}
          </Button>
          <Button
            type="primary"
            onClick={() =>
              isModalVisibleSpecialAnalysis?.type ===
              "export_special_analysis"
                ? handleExportRelativesSP(SESSION_TYPES.RAPORT, selectedValues)
                : generateReport("Заключение", selectedValues)
            }
          >
            {t("ok")}
          </Button>
        </div>
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
      <Flex>
        <Flex className="mb-1 w-100">
          <div className="d-flex flex-column align-items-end w-100">
            <Row
              gutter={24}
              className="w-100 mb-2"
              justify="space-between"
              align="middle"
            >
              <Col xs={24} sm={12} md={12} lg={10} xl={8} xxl={5}>
                <div className="ml-20 mb-3">
                  <Button
                    onClick={() => setIsModalVisibleSpecialAnalysis({ visible: true, type: "generate_report" })}
                    type="primary"
                    icon={<FileExcelOutlined />}
                    block
                  >
                    {t("generate_report")}
                  </Button>
                </div>
              </Col>
              <Col xs="auto">
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    className="w-100 mb-2"
                    onClick={() => {
                      clearHandle();
                    }}
                  >
                    <ClearOutlined />
                    {t("clear")}
                  </Button>
                  <Button
                    className="w-100 mb-2"
                    onClick={() => {
                      backHandle();
                    }}
                  >
                    <LeftCircleOutlined />
                    {t("back")}
                  </Button>
                </div>
              </Col>
            </Row>
            <Row gutter={24} className="w-100 mb-2 justify-content-end">
              <Col xs={24} sm={12} md={12} lg={12} xl={8} xxl={3}>
                <Button
                  className="w-100 mb-2"
                  onClick={() => sverka()}
                  type="primary"
                >
                  <FileExcelOutlined />
                  <span className="ml-2">{t("sverka")}</span>
                </Button>
              </Col>
              {/* <Col xs={24} sm={12} md={12} lg={12} xl={8} xxl={5}>
                <Button
                  className="w-100 mb-2"
                  onClick={() => setIsModalVisibleMalumotnoma(true)}
                  type="primary"
                >
                  <FileExcelOutlined />
                  <span className="ml-2">{t("export_malumotnoma")}</span>
                </Button>
              </Col>
              <Col xs={24} sm={12} md={12} lg={12} xl={8} xxl={5}>
                <Button
                  className="w-100 mb-2"
                  onClick={() => exportExcel()}
                  type="primary"
                >
                  <FileExcelOutlined />
                  <span className="ml-2">{t("excel_report")}</span>
                </Button>
              </Col>*/}
              <Col xs={24} sm={13} md={13} lg={13} xl={10} xxl={5}>
                <Button
                  className="w-100 mb-2"
                  onClick={() => setIsModalVisibleSpecialAnalysis({ visible: true, type: "export_special_analysis" })}
                  type="primary"
                >
                  <FileExcelOutlined />
                  <span className="ml-2">{t("export_special_analysis")}</span>
                </Button>
              </Col>
              <Col xs={24} sm={8} md={6} lg={5} xl={5} xxl={3}>
                <ProviderComponent
                  rolePermission={["admin", "user", "superAdmin"]}
                >
                  <Button
                    onClick={goToSearch}
                    type="primary"
                    className="w-100 mb-2"
                  >
                    <PlusCircleOutlined />
                    <span className="ml-2">{t("add")}</span>
                  </Button>
                </ProviderComponent>
              </Col>
            </Row>
          </div>
        </Flex>
      </Flex>
      <div className="table-responsive">
        <DndContext modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
          <SortableContext
            items={list.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <Table
              columns={tableColumns}
              dataSource={list}
              rowKey="id"
              components={{
                body: {
                  row: RowTable,
                },
              }}
              rowSelection={{
                selectedRowKeys: selectedRowKeys,
                type: "checkbox",
                preserveSelectedRowKeys: false,
                ...rowSelection,
              }}
              loading={loading}
              pagination={{
                current: pageNumber,
                pageSize: pageSize,
                total: total,
                showSizeChanger: true,
                pageSizeOptions: ["10", "20", "50", "100"],
                onShowSizeChange: (current, size) => {
                  setPageSize(size);
                  setPageNumber(1);
                },
                onChange: (page, pageSize) => {
                  setPageNumber(page);
                },
              }}
            />
            <Row>
              <Col style={{ marginTop: -50 }}>
                <span style={{ fontWeight: "bold" }}>
                  {t("total_number_of_entries")}: {total}
                </span>
              </Col>
            </Row>
          </SortableContext>
        </DndContext>
      </div>
    </Card>
  );
};

export default CartList;
