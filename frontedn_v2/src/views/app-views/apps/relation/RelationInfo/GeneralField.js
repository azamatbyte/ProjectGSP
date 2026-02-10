import React, { useEffect, useState } from "react";
import { Input, Row, Col, Card, Form, Spin, message } from "antd";
import RelationlaceService from "services/RelationlaceService";
import { useTranslation } from "react-i18next";

const GeneralField = ({id}) => {
	const [loading, setLoading] = useState(true);
	const [relationData, setInitiatorData] = useState(null);
	const { t } = useTranslation();

	useEffect(() => {
		const fetchInitiatorData = async (id) => {
			try {
				setLoading(true);
				const response = await RelationlaceService.getById(id);
				setInitiatorData(response?.data?.relationDegree);
				if (response.status!==200) throw new Error("Failed to fetch data");
			} catch (error) {
				message.error(t("no_data"));
				console.error(error);
			} finally {
				setLoading(false);
			}
		};

		if (id) {
			fetchInitiatorData(id);
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
				<Card title={t("basic_info")}>
					<Form
						layout="vertical"
						initialValues={relationData}
					>
						<Row gutter={16}>
							<Col xs={24} sm={24} md={12}>
								<Form.Item 
									name="name" 
									label={t("relation_degree")}
								>
									<Input 
										value={relationData?.name}
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
