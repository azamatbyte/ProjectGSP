import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
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
  DatePicker,
  Pagination,
  Checkbox,
  Tooltip,
} from "antd";
import DateRangeFilter from "components/shared-components/DateRangeFilter";
import {
  EyeOutlined,
  SearchOutlined,
  PlusCircleOutlined,
  EditOutlined,
  UserAddOutlined,
  UpOutlined,
  DownOutlined,
  LeftCircleOutlined,
  ClearOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import { useNavigate } from "react-router-dom";
import RegistrationService from "services/RegistrationService";
import InitiatorService from "services/InitiatorService";
import { getDateDayString, getDateString } from "utils/aditionalFunctions";
import { useTranslation } from "react-i18next";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT } from "constants/DateConstant";
import debounce from "lodash/debounce";
import AuthService from "services/AuthService";
import { CompleteStatus } from "constants/CompleteStatus";
import { MODEL_TYPES, SESSION_TYPES } from "utils/sessions";
import RelativeService from "services/RelativeService";
import AccessStatusService from "services/AccessStatusService";

const GlobalSearch = (props) => {
  console.log("GlobalSearch render");
  const [searchParams] = useSearchParams();
  const searchParamsData = searchParams.get("search");
  const navigate = useNavigate();
  const location = useLocation();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageNumber, setPageNumber] = useState(
    parseInt(searchParams.get("pageNumber")) || 1
  );
  const [pageSize, setPageSize] = useState(
    parseInt(searchParams.get("pageSize")) || 10
  );
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(() => {
    return searchParamsData ? JSON.parse(searchParamsData) : {};
  });
  const [expand, setExpand] = useState(false);
  const [form] = Form.useForm();
  const { t } = useTranslation();
  const [initiatorOptions, setInitiatorOptions] = useState([]);
  const [initiatorFetching, setInitiatorFetching] = useState(false);
  const [executorOptions, setExecutorOptions] = useState([]);
  const [executorFetching, setExecutorFetching] = useState(false);
  const [accessStatusOptions, setAccessStatusOptions] = useState([]);
  const [accessStatusFetching, setAccessStatusFetching] = useState(false);

  // FIX 1: Use ref to track if we're programmatically updating URL to prevent loops
  const isUpdatingURL = useRef(false);
  // REF: track initial mount to avoid updating URL or fetching unnecessarily
  const isInitialMount = useRef(true);

  // FIX 2: Memoize the updateSearchParams function and only update when necessary
  const updateSearchParams = useCallback(() => {
    if (isUpdatingURL.current) return; // Prevent recursive updates

    isUpdatingURL.current = true;
    const params = new URLSearchParams();
    params.set("pageNumber", pageNumber.toString());
    params.set("pageSize", pageSize.toString());
    params.set("search", JSON.stringify(search));
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });

    // Reset flag after a short delay
    setTimeout(() => {
      isUpdatingURL.current = false;
    }, 0);
  }, [pageNumber, pageSize, search, location.pathname, navigate]);

  // FIX 3: Separate fetchData function with proper dependencies
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await RegistrationService.getListByGlobalSearch(
        pageNumber,
        pageSize,
        search
      );
      if (res?.data?.data?.length > 0) {
        setList(res?.data?.data);
      } else {
        setList([]);
        message.error(t("no_data"));
      }
    } catch (error) {
      setList([]);
      setTotal(0);
      setLoading(false);
      message.error(t("data_not_found"));
    } finally {
      setLoading(false);
    }
  }, [pageNumber, pageSize, search]);

  // FIX 4: Separate fetchCount function
  const fetchCount = useCallback(async () => {
    try {
      const res = await RegistrationService.getListByGlobalSearchCount(search);
      setTotal(res?.data?.totalCount || 0);
      return res?.data?.totalCount;
    } catch (error) {
      setTotal(0);
      message.error(t("data_not_found"));
    }
  }, [pageNumber, pageSize, search, t]);

  // FIX 5: Sync FROM URL only when the URL actually changes (avoid clobbering local edits)
  useEffect(() => {
    if (isUpdatingURL.current) return; // Ignore updates triggered by our own navigate()

    const urlPageNumber = Number.parseInt(searchParams.get("pageNumber") || "", 10) || 1;
    const urlPageSize = Number.parseInt(searchParams.get("pageSize") || "", 10) || 10;

    let urlSearch = {};
    const rawSearch = searchParams.get("search");
    if (rawSearch) {
      try {
        urlSearch = JSON.parse(rawSearch);
      } catch (_) {
        urlSearch = {};
      }
    }

    // Only update if values are actually different
    if (urlPageNumber !== pageNumber) {
      setPageNumber(urlPageNumber);
    }
    if (urlPageSize !== pageSize) {
      setPageSize(urlPageSize);
    }
    if (JSON.stringify(urlSearch) !== JSON.stringify(search)) {
      setSearch(urlSearch);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // FIX 6: Separate effect for fetching data - this will run when pageNumber/pageSize change
  useEffect(() => {
    // Always fetch data when fetchData changes (it depends on pageNumber/pageSize/search)
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData]);

  // FIX 7: Update URL params only when state changes, with debouncing
  useEffect(() => {
    // Skip updating URL on initial mount when state is being synced from the URL
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const timeoutId = setTimeout(() => {
      updateSearchParams();
    }, 100); // Small delay to batch updates

    return () => clearTimeout(timeoutId);
  }, [pageNumber, pageSize, search]); // These trigger URL updates

  // FIX 8: Handle pagination reset with better logic
  useEffect(() => {
    // Recalculate count and reset page if necessary. include fetchCount/pageNumber in deps.
    fetchCount().then((totalCount) => {
      if (totalCount) {
        const totalPages = Math.ceil(totalCount / pageSize);
        // Only reset page if current page exceeds total pages AND we're not on page 1
        if (pageNumber > totalPages && totalPages > 0 && pageNumber !== 1) {
          setPageNumber(1);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchCount]); // include fetchCount/pageNumber

  // Helper functions for fetching data
  const fetchInitiators = useCallback(async (searchText) => {
    try {
      const response = await InitiatorService.getList(1, 5, searchText);
      return (
        response?.data?.data?.map((item) => ({
          full_name: item?.first_name + " " + item?.last_name,
          id: item?.id,
        })) || []
      );
    } catch (error) {
      return [];
    }
  }, []);

  const fetchExecutors = useCallback(async (searchText) => {
    try {
      const response = await AuthService.getList(1, 5, searchText);
      return (
        response?.data?.users?.map((item) => ({
          full_name: item?.first_name + " " + item?.last_name,
          id: item?.id,
        })) || []
      );
    } catch (error) {
      return [];
    }
  }, []);

  const fetchAccessStatus = async (searchText) => {
    try {
      const response = await AccessStatusService.listWithStatus(
        1,
        25,
        searchText
      );
      return response?.data?.accessStatuses;
    } catch (error) {
      console.error("Xatolik:", error);
      return [];
    }
  };

  // FIXED: Initialize options only once
  useEffect(() => {
    const initializeOptions = async () => {
      try {
        const [initiators, executors, accessStatus] = await Promise.all([
          fetchInitiators(""),
          fetchExecutors(""),
          fetchAccessStatus(""),
        ]);

        setInitiatorOptions(
          initiators.map((item) => ({
            value: item?.id,
            label: item?.full_name,
            id: item?.id,
          }))
        );

        setExecutorOptions(
          executors.map((item) => ({
            value: item?.id,
            label: item?.full_name,
            id: item?.id,
          }))
        );

        setAccessStatusOptions(
          accessStatus.map((item) => ({
            value: item.name,
            label: item.name,
          }))
        );
      } catch (error) {
        console.error("Error initializing options:", error);
      }
    };

    initializeOptions();
  }, [fetchInitiators, fetchExecutors]); // Added dependencies

  const backHandle = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const createSessionFunction = useCallback(async (id, type, model) => {
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
  }, [t]);

  // FIXED: Wrap editRegistration in useCallback
  const editRegistration = useCallback((row) => {
    if (
      row?.model_name === MODEL_TYPES.REGISTRATION ||
      row?.model_name === MODEL_TYPES.REGISTRATION4
    ) {
      navigate(
        `/app/apps/register/edit-register/${row.id}?model=${row?.model_name}`
      );
    } else {
      navigate(
        `/app/apps/relative/edit-relative/${row.id}?model=${MODEL_TYPES.RELATIVE}`
      );
    }
  }, [navigate]);

  // FIXED: Wrap addToCart in useCallback
  const addToCart = useCallback(async (row, session, model) => {
    try {
      await createSessionFunction(row?.id, session, model);
    } catch (error) {
      message.error(t("error"));
    }
  }, [createSessionFunction, t]);

  // FIXED: Wrap viewDetails in useCallback
  const viewDetails = useCallback((row) => {
    if (
      row?.model_name === MODEL_TYPES.REGISTRATION ||
      row?.model_name === MODEL_TYPES.REGISTRATION4
    ) {
      navigate(
        `/app/apps/register/info-register/${row.id}?model=${row?.model_name}`
      );
    } else {
      navigate(
        `/app/apps/relative/info-relative/${row.id}?model=${MODEL_TYPES.RELATIVE}`
      );
    }
  }, [navigate]);

  // FIXED: Wrap addRelative in useCallback
  const addRelative = useCallback((row) => {
    if (
      row?.model_name === MODEL_TYPES.REGISTRATION ||
      row?.model_name === MODEL_TYPES.REGISTRATION4
    ) {
      navigate(
        `/app/apps/relative/add-relative/${row.id}?model=${MODEL_TYPES.RELATIVE}`
      );
    }
  }, [navigate]);

  // FIXED: Memoize the dropdown menu to prevent recreation on every render
  const dropdownMenu = useCallback(
    (row) => {
      const items = [
        {
          key: "add-main",
          label: (
            <Flex alignItems="center">
              <PlusCircleOutlined />
              <span className="ml-2">{t("add_main")}</span>
            </Flex>
          ),
          onClick: () =>
            addToCart(row, SESSION_TYPES.SESSION, MODEL_TYPES.RELATIVE),
        },
        {
          key: "add-reserve",
          label: (
            <Flex alignItems="center">
              <PlusCircleOutlined />
              <span className="ml-2">{t("add_reserve")}</span>
            </Flex>
          ),
          onClick: () =>
            addToCart(row, SESSION_TYPES.RESERVE, MODEL_TYPES.RELATIVE),
        },
        {
          key: "add-conclusion",
          label: (
            <Flex alignItems="center">
              <PlusCircleOutlined />
              <span className="ml-2">{t("add_conclusion")}</span>
            </Flex>
          ),
          onClick: () =>
            addToCart(row, SESSION_TYPES.RAPORT, MODEL_TYPES.RELATIVE),
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
      if (row?.model_name === "registration") {
        items.push({
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

      return { items };
    },
    [t, addRelative, editRegistration, viewDetails, addToCart]
  );

  const debouncedFetchInitiators = useMemo(
    () =>
      debounce(async (searchText) => {
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
      }, 500),
    [fetchInitiators]
  );

  const debouncedFetchExecutors = useMemo(
    () =>
      debounce(async (searchText) => {
        if (searchText.length >= 1) {
          setExecutorFetching(true);
          const executors = await fetchExecutors(searchText);
          setExecutorOptions(
            executors.map((item) => ({
              value: item?.id,
              label: item?.full_name,
              id: item?.id,
            }))
          );
          setExecutorFetching(false);
        }
      }, 500),
    [fetchExecutors]
  );

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

  const tableColumns = useMemo(
    () => [
      {
        title: t("№"),
        dataIndex: "number",
        align: "center",
        render: (text, record, index) => (
          <span>{total - ((pageNumber - 1) * pageSize + index)}</span>
        ),
      },
      {
        title: <UnorderedListOutlined />,
        dataIndex: "actions",
        width: "5%",
        align: "center",
        render: (_, elm) => (
          <div className="text-right">
            <EllipsisDropdown menu={dropdownMenu(elm)} />
          </div>
        ),
      },
      {
        title: t("registration_number"),
        dataIndex: "reg_number",
        align: "center",
        // sorter: (a, b) => utils.antdTableSorter(a, b, "reg_number"),
        render: (reg_number) => (
          <Tooltip title={reg_number}>
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {reg_number?.length > 10
                ? "..." + reg_number.slice(reg_number.length - 10)
                : reg_number}
            </span>
          </Tooltip>
        ),
      },
      // {
      //   title: t("model"),
      //   dataIndex: "model_name",
      //   columnWidth: "150px",
      //   sorter: (a, b) => utils.antdTableSorter(a, b, "model_name"),
      //   render: (model_name) => (
      //     <span
      //       style={{
      //         whiteSpace: "nowrap",
      //         overflow: "hidden",
      //         textOverflow: "ellipsis",
      //       }}
      //     >
      //       {model_name === "registration"
      //         ? t("registration")
      //         : model_name === "relative"
      //         ? t("relative")
      //         : model_name === "registration4"
      //         ? t("registration4")
      //         : model_name === "relativeWithoutAnalysis"
      //         ? t("relativeWithoutAnalysis")
      //         : model_name}
      //     </span>
      //   ),
      // },
      {
        title: t("form_code"),
        dataIndex: "form_reg",
        align: "center",
        width: "10%",
        // sorter: (a, b) => utils.antdTableSorter(a, b, "form_reg"),
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
        align: "center",
        width: "10%",
        // sorter: (a, b) => utils.antdTableSorter(a, b, "form_reg_log"),
        render: (form_reg_log) => {
          const truncated =
            form_reg_log && form_reg_log.length > 6
              ? "..." + form_reg_log.slice(form_reg_log.length - 6)
              : form_reg_log;

          return (
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {truncated}
            </span>
          );
        },
      },
      {
        title: t("relation_degree"),
        dataIndex: "relationdegree",
        align: "center",
        width: "10%",
        // sorter: (a, b) => utils.antdTableSorter(a, b, "relationdegree"),
        render: (relationdegree) => (
          <Tooltip title={relationdegree}>
            <span>
              {relationdegree ? (
                relationdegree?.length > 10 ? (
                  relationdegree?.slice(0, 10) + "..."
                ) : (
                  relationdegree
                )
              ) : (
                <></>
              )}
            </span>
          </Tooltip>
        ),
      },

      {
        title: t("full_name"),
        dataIndex: "full_name",
        width: "15%",
        align: "center",
        // sorter: (a, b) => utils.antdTableSorter(a, b, "full_name"),
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
        // render: (full_name) => {
        //   const shouldShowTooltip = full_name && full_name.length > 10;
        //   return (
        //     <Tooltip title={shouldShowTooltip ? full_name : ""}>
        //       <span
        //         style={{
        //           whiteSpace: "nowrap",
        //           overflow: "hidden",
        //           textOverflow: "ellipsis",
        //         }}
        //       >
        //         {full_name}
        //       </span>
        //     </Tooltip>
        //   );
        // },
      },
      {
        title: t("birth_date"),
        dataIndex: "birth_date",
        align: "center",
        width: "10%",
        render: (_, elm) => (
          <>{elm?.birth_date ? elm?.birth_datev1 : elm?.birth_year}</>
        ),
      },
      {
        title: t("register_date"),
        dataIndex: "reg_date",
        align: "center",
        width: "10%",
        // sorter: (a, b) => utils.antdTableSorter(a, b, "reg_date"),
        render: (reg_date) => (
          <Tooltip title={getDateDayString(reg_date)}>
            <span>
              {reg_date ? (
                getDateDayString(reg_date)?.length > 10 ? (
                  getDateDayString(reg_date)?.slice(0, 10) + "..."
                ) : (
                  getDateDayString(reg_date)
                )
              ) : (
                <></>
              )}
            </span>
          </Tooltip>
        ),
      },
      {
        title: t("register_end_date"),
        dataIndex: "reg_end_date",
        align: "center",
        width: "10%",
        // sorter: (a, b) => utils.antdTableSorter(a, b, "reg_end_date"),
        render: (reg_end_date) => (
          <Tooltip title={getDateDayString(reg_end_date)}>
            <span>
              {reg_end_date ? (
                getDateDayString(reg_end_date)?.length > 10 ? (
                  getDateDayString(reg_end_date)?.slice(0, 10) + "..."
                ) : (
                  getDateDayString(reg_end_date)
                )
              ) : (
                <></>
              )}
            </span>
          </Tooltip>
        ),
      },
      {
        title: t("complete_status"),
        dataIndex: "complete_status",
        align: "center",
        width: "10%",
        // sorter: (a, b) => utils.antdTableSorter(a, b, "complete_status"),
        render: (complete_status, elm) => (
          <>
            {complete_status === "WAITING" ? (
              new Date(elm?.expired_date) > new Date() ? (
                <Tag color="green">{t("waiting")}</Tag>
              ) : elm?.access_status === "ЗАКЛЮЧЕНИЕ" ? (
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
        dataIndex: "access_status",
        width: "10%",
        align: "center",
        // sorter: (a, b) => utils.antdTableSorter(a, b, "access_status"),
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
        align: "center",
        // sorter: (a, b) => utils.antdTableSorter(a, b, "expired"),
        render: (expired) => (
          <Tooltip title={getDateDayString(expired)}>
            <span>
              {getDateDayString(expired)?.length > 10
                ? getDateDayString(expired)?.slice(0, 10) + "..."
                : getDateDayString(expired)}
            </span>
          </Tooltip>
        ),
      },
      {
        title: t("pinfl"),
        dataIndex: "pinfl",
        width: "5%",
        align: "center",
        render: (pinfl) => (
          <Tooltip title={pinfl}>
            <span>
              {pinfl?.length > 10 ? pinfl?.slice(0, 10) + "..." : pinfl}
            </span>
          </Tooltip>
        ),
      },
      {
        title: t("conclusion_register_number"),
        dataIndex: "conclusion_reg_num",
        align: "center",
        // sorter: (a, b) => utils.antdTableSorter(a, b, "conclusion_reg_num"),
        render: (conclusion_reg_num) => (
          <Tooltip title={conclusion_reg_num}>
            <span>
              {conclusion_reg_num ? (
                conclusion_reg_num?.length > 10 ? (
                  conclusion_reg_num?.slice(0, 10) + "..."
                ) : (
                  conclusion_reg_num
                )
              ) : (
                <></>
              )}
            </span>
          </Tooltip>
        ),
      },
      {
        title: t("birth_place"),
        dataIndex: "birth_place",
        align: "center",
        // sorter: (a, b) => utils.antdTableSorter(a, b, "birth_place"),
        render: (birthPlace) => {
          const text = birthPlace || "";
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
        align: "center",
        // sorter: (a, b) => utils.antdTableSorter(a, b, "workplace"),
        render: (workplace, elm) => {
          const fullText = `${workplace || ""} ${elm?.positionv1 || ""}`.trim();
          if (fullText.length > 7) {
            const truncatedText = fullText.slice(0, 7) + "...";
            return (
              <Tooltip title={fullText}>
                <span>{truncatedText}</span>
              </Tooltip>
            );
          }

          return (
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "inline-block",
                maxWidth: "200px", // Adjust as needed
              }}
            >
              {fullText}
            </span>
          );
        },
      },

      {
        title: t("compr_info"),
        dataIndex: "notes",
        align: "center",
        // sorter: (a, b) => utils.antdTableSorter(a, b, "notes"),
        render: (notes) => {
          // Define the truncated version if notes length exceeds 10 characters
          const truncated =
            notes && notes.length > 10 ? notes.slice(0, 10) + "..." : notes;

          return (
            <Tooltip title={notes}>
              <p
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "200px",
                  margin: 0,
                }}
              >
                {truncated}
              </p>
            </Tooltip>
          );
        },
      },
      {
        title: t("residence"),
        dataIndex: "residence",
        align: "center",
        // sorter: (a, b) => utils.antdTableSorter(a, b, "residence"),
        render: (residence) => (
          <Tooltip title={residence}>
            {residence
              ? residence?.length > 10
                ? residence?.slice(0, 10) + "..."
                : residence
              : t("unknown")}
          </Tooltip>
        ),
      },

      {
        title: t("initiator"),
        dataIndex: "initiator",
        align: "center",
        // sorter: (a, b) => utils.antdTableSorter(a, b, "initiator"),
        render: (_, elm) => {
          const fullName =
            (elm?.initiator_last_name
              ? elm?.initiator_last_name?.slice(0, 1) + "."
              : "") +
            (elm?.initiator_first_name ? elm?.initiator_first_name : "") +
            (elm?.initiator_father_name
              ? elm?.initiator_father_name?.slice(0, 1) + "."
              : "");
          return (
            <Tooltip title={fullName}>
              <span>
                {fullName?.length > 10
                  ? fullName?.slice(0, 10) + "..."
                  : fullName}
              </span>
            </Tooltip>
          );
        },
      },
      {
        title: t("executor"),
        dataIndex: "executor",
        align: "center",
        // sorter: (a, b) => utils.antdTableSorter(a, b, "executor"),
        render: (_, elm) => (
          <>
            {elm?.executor_last_name} {elm?.executor_first_name}
          </>
        ),
      },
      {
        title: t("updated_at"),
        dataIndex: "updatedat",
        align: "center",
        render: (updatedat) => (
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "inline-block",
              maxWidth: "200px", // Adjust as needed
            }}
          >
            {updatedat ? getDateString(updatedat) : t("unknown")}
          </span>
        ),
      },
    ],
    [t, total, pageNumber, pageSize, dropdownMenu]
  );

  // FIX 9: Ensure pagination handlers don't cause loops
  const handlePageChange = useCallback((page, newPageSize) => {
    if (page !== pageNumber) {
      setPageNumber(page);
    }
    if (newPageSize && newPageSize !== pageSize) {
      setPageSize(newPageSize);
      // If page size changes, reset to page 1
      if (page !== 1) {
        setPageNumber(1);
      }
    }
  }, [pageNumber, pageSize]);

  const handlePageSizeChange = useCallback((current, size) => {
    setPageSize(size);
    setPageNumber(1);
  }, []);


  return (
    <Card>
      <Flex
        alignItems="center"
        justifyContent="space-between"
        mobileFlex={false}
      >
        <Flex className="mb-1" mobileFlex={false} alignItems="center">
          <Select
            style={{ width: "250px" }}
            placeholder={t("model_search")}
            // keep it uncontrolled when there's no model so clearing shows placeholder
            value={search?.model ?? undefined}
            options={[
              { value: "all", label: t("all") },
              { value: "registration", label: t("registration") },
              { value: "registration4", label: t("registration4") },
              { value: "relative", label: t("relative") },
              {
                value: "relativeWithoutAnalysis",
                label: t("relativeWithoutAnalysis"),
              },
            ]}
            onChange={(value) => {
              // treat "all" or cleared selection as no model filter
              setSearch((prev) => {
                const next = { ...(prev || {}) };
                if (!value || value === "all") {
                  // remove model only if present
                  if (Object.prototype.hasOwnProperty.call(next, "model")) {
                    delete next.model;
                  }
                } else {
                  next.model = value;
                }
                return next;
              });

              // always reset paging when model changes
              setPageNumber(1);
            }}
            allowClear
            tabIndex={0}
          />
          <div style={{ marginLeft: 12 }}>
            <Row gutter={[8, 8]} style={{ paddingTop: 24 }}>
              <Col span={4} xs={3}>
                <Form.Item name="regNumber" label={null}>
                  <Checkbox
                    checked={search.regNumberStatus || false}
                    onChange={(e) => {
                      setSearch({
                        ...search,
                        regNumberStatus: e.target.checked ? true : false,
                      });
                      setPageNumber(1);
                    }}
                  ></Checkbox>
                </Form.Item>
              </Col>
              <Col span={20} xs={21}>
                <Form.Item name="regNumber" label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    autoFocus
                    tabIndex={1}
                    placeholder={t("reg_number_search")}
                    type="text"
                    onChange={(e) => {
                      setSearch({ ...search, regNumber: e.target.value });
                      setPageNumber(1);
                    }}
                    allowClear
                  />
                </Form.Item>
              </Col>
            </Row>
          </div>
        </Flex>
        <Flex className="mb-1">
          <div className="mr-md-3 mb-3 d-flex gap-2">
            <Button className="ml-2" onClick={backHandle} tabIndex={22}>
              <LeftCircleOutlined /> {t("back")}
            </Button>
          </div>
        </Flex>
      </Flex>
      <Form
        form={form}
        name="advanced_search"
        className="ant-advanced-search-form"
      >
        <Row gutter={[16, 16]} style={{ marginBottom: "-10px" }}>
          <Col span={24} lg={4} md={6} sm={8} xs={12}>
            <Row gutter={[8, 8]}>
              <Col span={4} xs={3}>
                <Form.Item name="form_reg" label={null}>
                  <Checkbox
                    checked={search.form_regStatus || false}
                    onChange={(e) => {
                      setSearch({
                        ...search,
                        form_regStatus: e.target.checked ? true : false,
                      });
                      setPageNumber(1);
                    }}
                  ></Checkbox>
                </Form.Item>
              </Col>
              <Col span={20} xs={21}>
                <Form.Item name="form_reg" label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("form")}
                    tabIndex={2}
                    type="text"
                    onChange={(e) => {
                      setSearch({ ...search, form_reg: e.target.value });
                      setPageNumber(1);
                    }}
                    allowClear
                  />
                </Form.Item>
              </Col>
            </Row>
          </Col>
          <Col span={24} lg={4} md={6} sm={8} xs={12}>
            <Row gutter={[8, 8]}>
              <Col span={4} xs={3}>
                <Form.Item name="lastNameStatus" label={null}>
                  <Checkbox
                    checked={search.lastNameStatus || false}
                    onChange={(e) => {
                      setSearch({
                        ...search,
                        lastNameStatus: e.target.checked ? true : false,
                      });
                      setPageNumber(1);
                    }}
                  ></Checkbox>
                </Form.Item>
              </Col>
              <Col span={20} xs={21}>
                <Form.Item name="lastName" label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("last_name")}
                    tabIndex={3}
                    type="text"
                    onChange={(e) => {
                      setSearch({ ...search, lastName: e.target.value });
                      setPageNumber(1);
                    }}
                    allowClear
                  />
                </Form.Item>
              </Col>
            </Row>
          </Col>
          <Col span={24} lg={4} md={6} sm={8} xs={12}>
            <Row gutter={[8, 8]}>
              <Col span={4} xs={3}>
                <Form.Item name="firstNameStatus" label={null}>
                  <Checkbox
                    checked={search.firstNameStatus || false}
                    onChange={(e) => {
                      setSearch({
                        ...search,
                        firstNameStatus: e.target.checked ? true : false,
                      });
                      setPageNumber(1);
                    }}
                  ></Checkbox>
                </Form.Item>
              </Col>
              <Col span={20} xs={21}>
                <Form.Item name="firstName" label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("first_name")}
                    tabIndex={4}
                    type="text"
                    onChange={(e) => {
                      setSearch({ ...search, firstName: e.target.value });
                      setPageNumber(1);
                    }}
                    allowClear
                  />
                </Form.Item>
              </Col>
            </Row>
          </Col>
          <Col span={24} lg={4} md={6} sm={8} xs={12}>
            <Row gutter={[8, 8]}>
              <Col span={4} xs={3}>
                <Form.Item name="fatherNameStatus" label={null}>
                  <Checkbox
                    checked={search.fatherNameStatus || false}
                    onChange={(e) => {
                      setSearch({
                        ...search,
                        fatherNameStatus: e.target.checked ? true : false,
                      });
                      setPageNumber(1);
                    }}
                  ></Checkbox>
                </Form.Item>
              </Col>
              <Col span={20} xs={21}>
                <Form.Item name="fatherName" label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("father_name")}
                    tabIndex={5}
                    type="text"
                    onChange={(e) => {
                      setSearch({ ...search, fatherName: e.target.value });
                      setPageNumber(1);
                    }}
                    allowClear
                  />
                </Form.Item>
              </Col>
            </Row>
          </Col>
          <Col span={24} lg={4} md={6} sm={8} xs={12}>
            <Row gutter={[8, 8]}>
              <Col span={4} xs={3}>
                <Form.Item name="birth_dateStatus" label={null}>
                  <Checkbox
                    checked={search.birth_dateStatus || false}
                    onChange={(e) => {
                      setSearch({
                        ...search,
                        birth_dateStatus: e.target.checked ? true : false,
                      });
                      setPageNumber(1);
                    }}
                  ></Checkbox>
                </Form.Item>
              </Col>
              <Col span={20} xs={21}>
                <Form.Item name="birthDate" label={null}>
                  <DatePicker.RangePicker
                    tabIndex={6}
                    inputReadOnly={false}
                    picker="year"
                    onChange={(dates) => {
                      if (dates) {
                        // Build explicit UTC ISO strings for start/end of selected years
                        const startYear = dates[0]?.year();
                        const endYear = dates[1]?.year();
                        setSearch({
                          ...search,
                          birth_date_start: startYear
                            ? new Date(Date.UTC(startYear, 0, 1, 0, 0, 0, 0)).toISOString()
                            : null,
                          birth_date_end: endYear
                            ? new Date(Date.UTC(endYear, 11, 31, 23, 59, 59, 999)).toISOString()
                            : null,
                        });
                        setPageNumber(1);
                      } else {
                        setSearch({
                          ...search,
                          birth_year_start: null,
                          birth_year_end: null,
                        });
                        setPageNumber(1);
                      }
                    }}
                    allowClear
                    format={"YYYY"}
                    placeholder={[
                      t("birth_date_start"),
                      t("birth_date_end"),
                    ]}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Col>
          <Col span={24} lg={4} md={6} sm={8} xs={12}>
            <Row gutter={[8, 8]}>
              <Col span={4} xs={3}>
                <Form.Item name="birthPlaceStatus" label={null}>
                  <Checkbox
                    checked={search.birthPlaceStatus || false}
                    onChange={(e) => {
                      setSearch({
                        ...search,
                        birthPlaceStatus: e.target.checked ? true : false,
                      });
                      setPageNumber(1);
                    }}
                  ></Checkbox>
                </Form.Item>
              </Col>
              <Col span={20} xs={21}>
                <Form.Item name="birthPlace" label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("birth_place")}
                    tabIndex={7}
                    type="text"
                    onChange={(e) => {
                      setSearch({ ...search, birthPlace: e.target.value });
                      setPageNumber(1);
                    }}
                    allowClear
                  />
                </Form.Item>
              </Col>
            </Row>
          </Col>
          {/* <Col span={24} lg={4} md={6} sm={8} xs={12}>
            <Row gutter={[8, 8]}>
              <Col span={4} xs={3}>
                <Form.Item name="register_date_startStatus" label={null}>
                  <Checkbox
                    checked={search.register_date_startStatus || false}
                    onChange={(e) => {
                      setSearch({
                        ...search,
                        register_date_startStatus: e.target.checked
                          ? true
                          : false,
                      });
                      setPageNumber(1);
                    }}
                  ></Checkbox>
                </Form.Item>
              </Col>
              <Col span={20} xs={21}>
                <Form.Item name="regDate" label={null}>
                  <DatePicker.RangePicker
                    onChange={(dates) => {
                      if (dates) {
                        setSearch({
                          ...search,
                          register_date_start: dates[0],
                          register_date_end: dates[1],
                        });
                      } else {
                        setSearch({
                          ...search,
                          register_date_start: null,
                          register_date_end: null,
                        });
                      }
                      setPageNumber(1);
                    }}
                    allowClear
                    format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                    placeholder={[
                      t("register_date_start"),
                      t("register_date_end"),
                    ]}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Col> */}
          {expand ? (
            <>
              <Col span={24} lg={4} md={6} sm={8} xs={12}>
                <Row gutter={[8, 8]}>
                  <Col span={4} xs={3}>
                    <Form.Item name="workPlaceStatus" label={null}>
                      <Checkbox
                        checked={search.workPlaceStatus || false}
                        onChange={(e) => {
                          setSearch({
                            ...search,
                            workPlaceStatus: e.target.checked ? true : false,
                          });
                          setPageNumber(1);
                        }}
                      ></Checkbox>
                    </Form.Item>
                  </Col>
                  <Col span={20} xs={21}>
                    <Form.Item name="workPlace" label={null}>
                      <Input
                        prefix={<SearchOutlined />}
                        placeholder={t("work_place")}
                        tabIndex={8}
                        type="text"
                        onChange={(e) => {
                          setSearch({ ...search, workPlace: e.target.value });
                          setPageNumber(1);
                        }}
                        allowClear
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Col>
              <Col span={24} lg={4} md={6} sm={8} xs={12}>
                <Row gutter={[8, 8]}>
                  <Col span={4} xs={3}>
                    <Form.Item name="positionStatus" label={null}>
                      <Checkbox
                        checked={search.positionStatus || false}
                        onChange={(e) => {
                          setSearch({
                            ...search,
                            positionStatus: e.target.checked ? true : false,
                          });
                          setPageNumber(1);
                        }}
                      ></Checkbox>
                    </Form.Item>
                  </Col>
                  <Col span={20} xs={21}>
                    <Form.Item name="position" label={null}>
                      <Input
                        prefix={<SearchOutlined />}
                        placeholder={t("position")}
                        tabIndex={9}
                        type="text"
                        onChange={(e) => {
                          setSearch({ ...search, position: e.target.value });
                          setPageNumber(1);
                        }}
                        allowClear
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Col>
              <Col span={24} lg={4} md={6} sm={8} xs={12}>
                <Row gutter={[8, 8]}>
                  <Col span={4} xs={3}>
                    <Form.Item name="residenceStatus" label={null}>
                      <Checkbox
                        checked={search.residenceStatus || false}
                        onChange={(e) => {
                          setSearch({
                            ...search,
                            residenceStatus: e.target.checked ? true : false,
                          });
                          setPageNumber(1);
                        }}
                      ></Checkbox>
                    </Form.Item>
                  </Col>
                  <Col span={20} xs={21}>
                    <Form.Item name="residence" label={null}>
                      <Input
                        prefix={<SearchOutlined />}
                        placeholder={t("residence")}
                        tabIndex={10}
                        type="text"
                        onChange={(e) => {
                          setSearch({ ...search, residence: e.target.value });
                          setPageNumber(1);
                        }}
                        allowClear
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Col>
              <Col span={24} lg={4} md={6} sm={8} xs={12}>
                <Row gutter={[8, 8]}>
                  <Col span={4} xs={3}>
                    <Form.Item name="register_date_startStatus" label={null}>
                      <Checkbox
                        checked={search.register_date_startStatus || false}
                        onChange={(e) => {
                          setSearch({
                            ...search,
                            register_date_startStatus: e.target.checked ? true : false,
                          });
                          setPageNumber(1);
                        }}
                      ></Checkbox>
                    </Form.Item>
                  </Col>
                  <Col span={20} xs={21}>
                    <Form.Item name="reg_date" label={null}>
                      <DateRangeFilter
                        picker="date"
                        setState={setSearch}
                        state={search}
                        startKey="register_date_start"
                        endKey="register_date_end"
                        resetPage={setPageNumber}
                        allowClear
                        format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                        utcMidnight
                        placeholder={[t("reg_date"), t("reg_date")]}
                        style={{ width: "100%" }}
                        tabIndex={11}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Col>
              {/* <Col span={4}>
                <Form.Item name="form_reg" label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("form_reg")}
                    type="text"
                    onChange={(e) =>
                      setSearch({ ...search, form_reg: e.target.value })
                    }
                  />
                </Form.Item>
              </Col> */}
              <Col span={24} lg={4} md={6} sm={8} xs={12}>
                <Row gutter={[8, 8]}>
                  <Col span={4} xs={3}>
                    <Form.Item name="register_end_dateStatus" label={null}>
                      <Checkbox
                        checked={search.register_end_dateStatus || false}
                        onChange={(e) => {
                          setSearch({
                            ...search,
                            register_end_dateStatus: e.target.checked
                              ? true
                              : false,
                          });
                          setPageNumber(1);
                        }}
                      ></Checkbox>
                    </Form.Item>
                  </Col>
                  <Col span={20} xs={21}>
                    <Form.Item name="regEndDate" label={null}>
                      <DateRangeFilter
                        picker="date"
                        setState={setSearch}
                        state={search}
                        startKey="register_end_date_start"
                        endKey="register_end_date_end"
                        resetPage={setPageNumber}
                        allowClear
                        format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                        placeholder={[t("register_end_date_start"), t("register_end_date_end")]}
                        style={{ width: "100%" }}
                        tabIndex={12}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Col>
              {/* <Col span={4}>
                <Form.Item name="completionStatus" label={null}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder={t("completion_status")}
                    type="text"
                    onChange={(e) =>
                      setSearch({
                        ...search,
                        completionStatus: e.target.value,
                      })
                    }
                  />
                </Form.Item>
              </Col> */}
              <Col span={24} lg={4} md={6} sm={8} xs={12}>
                <Row gutter={[8, 8]}>
                  <Col span={4} xs={3}>
                    <Form.Item name="accessStatusStatus" label={null}>
                      <Checkbox
                        checked={search.accessStatusStatus || false}
                        onChange={(e) => {
                          setSearch({
                            ...search,
                            accessStatusStatus: e.target.checked ? true : false,
                          });
                          setPageNumber(1);
                        }}
                      ></Checkbox>
                    </Form.Item>
                  </Col>
                  <Col span={20} xs={21}>
                    <Form.Item name="accessStatus" label={null}>
                      <Input
                        prefix={<SearchOutlined />}
                        placeholder={t("access_status")}
                        tabIndex={13}
                        type="text"
                        onChange={(e) => {
                          setSearch({ ...search, accessStatus: e.target.value });
                          setPageNumber(1);
                        }}
                        allowClear
                      />
                      {/* <Select
                        className="w-100"
                        placeholder={t("access_status")}
                        showSearch
                        style={{ width: 200, cursor: "pointer" }}
                        optionFilterProp="children"
                        value={search.accessStatus}
                        onChange={(value) => {
                          setSearch({
                            ...search,
                            accessStatus: value,
                          });
                          setPageNumber(1);
                        }}
                        onSearch={(searchText) => {
                          if (searchText.length === 0) {
                            // Agar qidiruv matni bo'sh bo'lsa, barcha natijalarni qayta yuklash
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
                        options={accessStatusOptions}
                        allowClear
                        tabIndex={13}
                      /> */}
                    </Form.Item>
                  </Col>
                </Row>
              </Col>
              {/* <Col span={24} lg={4} md={6} sm={8} xs={12}>
                <Row gutter={[8, 8]}>
                  <Col span={4} xs={3}>
                    <Form.Item name="conclusionRegNumStatus" label={null}>
                      <Checkbox
                        checked={search.conclusionRegNumStatus || false}
                        onChange={(e) => {
                          setSearch({
                            ...search,
                            conclusionRegNumStatus: e.target.checked
                              ? true
                              : false,
                          });
                          setPageNumber(1);
                        }}
                      ></Checkbox>
                    </Form.Item>
                  </Col>
                  <Col span={20} xs={21}>
                    <Form.Item name="conclusionRegNum" label={null}>
                      <Input
                        prefix={<SearchOutlined />}
                        placeholder={t("conclusion_register_number")}
                        type="text"
                        onChange={(e) => {
                          setSearch({
                            ...search,
                            conclusionRegNum: e.target.value,
                          });
                          setPageNumber(1);
                        }}
                        allowClear
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Col> */}

              <Col span={24} lg={4} md={6} sm={8} xs={12}>
                <Row gutter={[8, 8]}>
                  <Col span={4} xs={3}>
                    <Form.Item name="notesStatus" label={null}>
                      <Checkbox
                        checked={search.notesStatus || false}
                        onChange={(e) => {
                          setSearch({
                            ...search,
                            notesStatus: e.target.checked ? true : false,
                          });
                          setPageNumber(1);
                        }}
                      ></Checkbox>
                    </Form.Item>
                  </Col>
                  <Col span={20} xs={21}>
                    <Form.Item name="notes" label={null}>
                      <Input
                        prefix={<SearchOutlined />}
                        placeholder={t("compr_info")}
                        tabIndex={14}
                        type="text"
                        onChange={(e) => {
                          setSearch({ ...search, notes: e.target.value });
                          setPageNumber(1);
                        }}
                        allowClear
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Col>
              <Col span={24} lg={4} md={6} sm={8} xs={12}>
                <Row gutter={[8, 8]}>
                  <Col span={4} xs={3}>
                    <Form.Item name="completeStatusStatus" label={null}>
                      <Checkbox
                        checked={search.completeStatusStatus || false}
                        onChange={(e) => {
                          setSearch({
                            ...search,
                            completeStatusStatus: e.target.checked
                              ? true
                              : false,
                          });
                          setPageNumber(1);
                        }}
                      ></Checkbox>
                    </Form.Item>
                  </Col>
                  <Col span={20} xs={21}>
                    <Form.Item name="completeStatus" label={null}>
                      <Select
                        placeholder={t("completion_status")}
                        options={CompleteStatus}
                        tabIndex={15}
                        onChange={(value) => {
                          setSearch({ ...search, completeStatus: value });
                          setPageNumber(1);
                        }}
                        allowClear
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Col>
              <Col span={24} lg={4} md={6} sm={8} xs={12}>
                <Row gutter={[8, 8]}>
                  <Col span={4} xs={3}>
                    <Form.Item name="executorIdStatus" label={null}>
                      <Checkbox
                        checked={search.executorIdStatus || false}
                        onChange={(e) => {
                          setSearch({
                            ...search,
                            executorIdStatus: e.target.checked ? true : false,
                          });
                          setPageNumber(1);
                        }}
                      ></Checkbox>
                    </Form.Item>
                  </Col>
                  <Col span={20} xs={21}>
                    <Form.Item name="executorId" label={null}>
                      <Select
                        showSearch
                        className="w-100"
                        prefix={<SearchOutlined />}
                        placeholder={t("executor")}
                        style={{ width: 200, cursor: "pointer" }}
                        optionFilterProp="children"
                        onChange={(value) => {
                          setSearch({ ...search, executorId: value });
                          setPageNumber(1);
                        }}
                        onSearch={debouncedFetchExecutors}
                        loading={executorFetching}
                        filterOption={false}
                        options={executorOptions}
                        tabIndex={16}
                        allowClear
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Col>
              <Col span={24} lg={4} md={6} sm={8} xs={12}>
                <Row gutter={[8, 8]}>
                  <Col span={4} xs={3}>
                    <Form.Item name="or_tabStatus" label={null}>
                      <Checkbox
                        checked={search.or_tabStatus || false}
                        onChange={(e) => {
                          setSearch({
                            ...search,
                            or_tabStatus: e.target.checked ? true : false,
                          });
                          setPageNumber(1);
                        }}
                      ></Checkbox>
                    </Form.Item>
                  </Col>
                  <Col span={20} xs={21}>
                    <Form.Item name="or_tab" label={null}>
                      <Select
                        showSearch
                        className="w-100"
                        prefix={<SearchOutlined />}
                        placeholder={t("initiator")}
                        style={{ width: 200, cursor: "pointer" }}
                        optionFilterProp="children"
                        onChange={(value) => {
                          setSearch({ ...search, or_tab: value });
                          setPageNumber(1);
                        }}
                        onSearch={debouncedFetchInitiators}
                        loading={initiatorFetching}
                        filterOption={false}
                        options={initiatorOptions}
                        allowClear
                        tabIndex={17}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Col>
              <Col span={24} lg={4} md={6} sm={8} xs={12}>
                <Row gutter={[8, 8]}>
                  <Col span={4} xs={3}>
                    <Form.Item name="record_numberStatus" label={null}>
                      <Checkbox
                        checked={search.recordNumberStatus || false}
                        onChange={(e) => {
                          setSearch({
                            ...search,
                            recordNumberStatus: e.target.checked
                              ? true
                              : false,
                          });
                          setPageNumber(1);
                        }}
                      ></Checkbox>
                    </Form.Item>
                  </Col>
                  <Col span={20} xs={21}>
                    <Form.Item name="record_number" label={null}>
                      <Input
                        prefix={<SearchOutlined />}
                        placeholder={t("record_number")}
                        tabIndex={18}
                        type="text"
                        onChange={(e) => {
                          setSearch({ ...search, recordNumber: e.target.value });
                          setPageNumber(1);
                        }}
                        allowClear
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Col>
              <Col span={24} lg={4} md={6} sm={8} xs={12}>
                <Row gutter={[8, 8]}>
                  <Col span={4} xs={3}>
                    <Form.Item name="pinflStatus" label={null}>
                      <Checkbox
                        checked={search.pinflStatus || false}
                        onChange={(e) => {
                          setSearch({
                            ...search,
                            pinflStatus: e.target.checked ? true : false,
                          });
                          setPageNumber(1);
                        }}
                      ></Checkbox>
                    </Form.Item>
                  </Col>
                  <Col span={20} xs={21}>
                    <Form.Item name="pinfl" label={null}>
                      <Input
                        prefix={<SearchOutlined />}
                        placeholder={t("pinfl")}
                        tabIndex={19}
                        type="text"
                        onChange={(e) => {
                          setSearch({ ...search, pinfl: e.target.value });
                          setPageNumber(1);
                        }}
                        allowClear
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Col>
              {/* <Col span={4}>
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
              </Col> */}
              {/* <Col span={4}>
                <Form.Item name="updatedAt" label={null}>
                  <DatePicker.RangePicker
                    onChange={(dates) => {
                      if (dates) {
                        setSearch({
                          ...search,
                          updated_at_start: dates[0],
                          updated_at_end: dates[1],
                        });
                      }
                    }}
                    format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
                    placeholder={[t("updated_at_start"), t("updated_at_end")]}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </Col> */}
            </>
          ) : (
            <></>
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
              tabIndex={20}
              onClick={() => {
                setSearch({});
                form.resetFields();
                setPageNumber(1);
              }}
            >
              <ClearOutlined /> {t("clear")}
            </Button>
            <Button
              style={{ marginLeft: 8 }}
              // type="primary"
              // style={{ marginLeft: 8, fontSize: 12, padding: 0, height: "auto" }}
              tabIndex={21}
              onClick={() => setExpand(!expand)}
            >
              {expand ? <UpOutlined /> : <DownOutlined />} {t("more_search")}
            </Button>
          </Col>
        </Row>
      </Form>
      <div className="table-responsive">
        <Table
          tableProps={{
            footer: true,
          }}
          columns={tableColumns}
          dataSource={list.map((elm) => ({
            ...elm,
            birth_datev1: getDateDayString(elm?.birth_date),
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
              onShowSizeChange={handlePageSizeChange}
              onChange={handlePageChange}
            />
          </Col>
        </Row>
      </div>
    </Card>
  );
};

export default GlobalSearch;
