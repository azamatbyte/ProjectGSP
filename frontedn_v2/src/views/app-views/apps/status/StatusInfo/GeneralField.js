import React, { useEffect, useState } from "react";
import { Input, Row, Col, Card, Form, Spin, message, } from "antd";
import StatusService from "services/StatusService"; // You'll need to create this service
import dayjs from "dayjs"; // Add this import
import "dayjs/locale/en-gb"; // Import the desired locale
import { useTranslation } from "react-i18next";

// Set the locale globally
dayjs.locale("en-gb"); // Set the locale to 'en-gb' or any other locale you need

const GeneralField = ({id}) => {
	const { t } = useTranslation();
	const [loading, setLoading] = useState(true);
	const [statusData, setStatusData] = useState(null);

	useEffect(() => {
		const fetchStatusData = async (id) => {
			try {
				setLoading(true);
				const response = await StatusService.getById(id);
				setStatusData(response?.data?.accessStatus);
				if (response.status !== 200) throw new Error("Failed to fetch data");
			} catch (error) {
				message.error(t("failed_to_load_status_data"));
				console.error(error);
			} finally {
				setLoading(false);
			}
		};

		if (id) {
			fetchStatusData(id);
		}
	}, [id, t]);

	if (loading) {
		return (
			<div style={{ textAlign: "center", padding: "50px" }}>
				<Spin size="large" />
			</div>
		);
	}

	return (
		<Row gutter={16}>
			<Col xs={24} sm={24} md={17}>
				<Card>
					<Form
						layout="vertical"
						initialValues={statusData}

					>
						<Row gutter={16}>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="name" label={t("name")}>
									<Input
										readOnly
										className="w-100"
									/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="adminId" label={t("admin_id")}>
									<Input
										readOnly
										className="w-100"
									/>
								</Form.Item>
							</Col>

						</Row>
					</Form>
				</Card>
			</Col>
		</Row>
	);
};

export default GeneralField;
