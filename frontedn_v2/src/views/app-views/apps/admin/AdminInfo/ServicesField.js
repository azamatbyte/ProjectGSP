import React, { useEffect, useReducer } from "react";
import { Table, Card, message, Popconfirm } from "antd";
import dayjs from "dayjs";
import AuthService from "services/AuthService";
import Service from "services/Service";
import { getDateString } from "utils/aditionalFunctions";
import { Button, Modal, Select } from "antd";
import { DeleteOutlined, PlusCircleOutlined, UnorderedListOutlined } from "@ant-design/icons"; // Import DeleteOutlined icon
import { useTranslation } from "react-i18next";

const { Option } = Select;

const initialState = {
  services: [],
  loading: true,
  totalServices: 0,
  pagination: {
    current: 1,
    pageSize: 10,
  },
  fetchTrigger: false, // New field to track fetch trigger
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_SERVICES":
      return {
        ...state,
        services: action.payload.services,
        totalServices: action.payload.totalServices,
      };
    case "SET_PAGINATION":
      return {
        ...state,
        pagination: {
          ...state.pagination,
          ...action.payload,
        },
        fetchTrigger: !state.fetchTrigger, // Trigger fetch on pagination change
      };
    default:
      return state;
  }
}

const ServicesField = ({ id }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isModalVisible, setIsModalVisible] = React.useState(false); // State for modal visibility
  const [selectedService, setSelectedService] = React.useState(null);
  const [serviceOptions, setServiceOptions] = React.useState([]);
  const { t } = useTranslation();
  const fetchServiceOptions = async () => {
    try {
      const res = await Service.getServiceList(); // Fetch service list
      setServiceOptions(res.data.services); // Assuming the response structure
    } catch (error) {
      console.error("Error fetching service options:", error);
      message.error(t("error_fetching_services"));
    }
  };

  const handleAddService = async () => {
    try {
      // Logic to add the selected service
      await Service.addAdminService(id, selectedService); // Send adminId and serviceId
      message.success(t("service_added_successfully"));
      fetchServices(); 
    } catch (error) {
      console.error("Error adding service:", error);
      message.error(t("error_adding_service"));
    } finally {
      setIsModalVisible(false); // Close the modal after adding the service
    }
  };

  const fetchServices = async () => {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const { current, pageSize } = state.pagination;
      const res = await AuthService.getAdminServices(id, current, pageSize);
      dispatch({
        type: "SET_SERVICES",
        payload: {
          services: res?.data?.services || [],
          totalServices: res?.data?.totalServices || 0,
        },
      });
    } catch (error) {
      console.error("Error fetching services:", error);
      dispatch({
        type: "SET_SERVICES",
        payload: { services: [], totalServices: 0 },
      });
      message.error(t("data_not_found"));
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  useEffect(() => {
    fetchServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, state.fetchTrigger]); // Trigger only on ID change or fetchTrigger toggle

  const handleModalOpen = () => {
    fetchServiceOptions(); // Fetch service options when modal opens
    setIsModalVisible(true);
  };

  const handleTableChange = (page, pageSize) => {
    dispatch({ type: "SET_PAGINATION", payload: { current: page, pageSize } });
  };

  const handleDeleteService = async (serviceId) => {
    try {
      await Service.removeAdminService(id, serviceId); // Call the delete function
      message.success(t("service_deleted_successfully"));
      fetchServices(); // Refresh the services list
    } catch (error) {
      console.error("Error deleting service:", error);
      message.error(t("error_deleting_service"));
    }
  };

  const tableColumns = [
    {
      title: t("service"),
      dataIndex: "service",
      render: (service) => <>{service?.name}</>,
    },
    {
      title: t("service_description"),
      dataIndex: "service",
      width: "30%",
      render: (description) => <>{description?.description}</>,
    },
    {
      title: t("granted"),
      dataIndex: "grantedByAdmin",
      render: (granted) => (
        <>
          {granted?.first_name ? `${granted?.first_name} ${granted?.last_name}` : ""}
        </>
      ),
    },
    {
      title: t("created_at"),
      dataIndex: "createdAt",
      render: (createdAt) => <>{getDateString(createdAt)}</>,
      sorter: (a, b) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix(),
    },
    {
      title: <UnorderedListOutlined />,
      dataIndex: "action",
      render: (_, record) => (
        <Popconfirm
          title={t("are_you_sure_to_delete_this_service")}
          onConfirm={() => handleDeleteService(record.service.id)} // Call delete function
          okText={t("yes")}
          cancelText={t("no")}
        >
          <DeleteOutlined style={{ cursor: "pointer" }} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      <Modal
        title={t("add_service")}
        open={isModalVisible}
        onOk={handleAddService}
        onCancel={() => setIsModalVisible(false)}
      >
        <Select
          placeholder={t("select_service")}
          onChange={value => setSelectedService(value)} // Update selected service
          style={{ width: "100%" }}
        >
          {serviceOptions.map(service => ( // Populate options from fetched services
            <Option key={service.id} value={service.id}>{service.name}</Option>
          ))}
        </Select>
      </Modal>
      <Card bodyStyle={{ padding: "0px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding:"20px"}}>
          <div></div> {/* Placeholder for left alignment */}
          <Button type="primary" onClick={handleModalOpen}><PlusCircleOutlined />{t("add_service")}</Button> {/* Move button to the right */}
        </div>
        <div className="table-responsive">
          <Table
            columns={tableColumns}
            dataSource={state.services}
            loading={state.loading}
            rowKey="id"
            pagination={{
              current: state.pagination.current,
              pageSize: state.pagination.pageSize,
              total: state.totalServices,
              showSizeChanger: true,
              pageSizeOptions: ["10", "20", "30"],
              onChange: handleTableChange,
            }}
          />
        </div>
      </Card>


    </>
  );
};

export default ServicesField;
